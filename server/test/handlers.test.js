import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandlers } from "../src/handlers.js";
import { issueToken } from "../src/token.js";
import { createFakeStore } from "./helpers/fakeStore.js";

const SECRET = "test-secret";
const TODAY = "2026-06-30";
const now = () => new Date(`${TODAY}T12:00:00.000Z`);

function setup({ dailyLimit = 500 } = {}) {
  const store = createFakeStore();
  const handlers = createHandlers({ secret: SECRET, dailyLimit, store, now });
  return { store, ...handlers };
}

function validAnswerBody(overrides = {}) {
  return {
    user_id: "user-1",
    token: issueToken(SECRET, "user-1", TODAY),
    module_id: "us-presidents",
    module_version: "1",
    card_id: "george-washington",
    correct: true,
    attempt_number: 0,
    ...overrides,
  };
}

test("handleTokenRequest issues today's HMAC token for the given user", async () => {
  const { handleTokenRequest } = setup();
  const { status, body } = await handleTokenRequest({ user_id: "user-1" });
  assert.equal(status, 200);
  assert.equal(body.token, issueToken(SECRET, "user-1", TODAY));
});

test("handleTokenRequest 400s on a missing user_id", async () => {
  const { handleTokenRequest } = setup();
  const { status } = await handleTokenRequest({});
  assert.equal(status, 400);
});

test("handleTokenRequest never touches the store", async () => {
  const { handleTokenRequest, store } = setup();
  await handleTokenRequest({ user_id: "user-1" });
  assert.equal(store.answers.length, 0);
});

test("handleAnswerRequest accepts a valid token and persists the answer without user_id", async () => {
  const { handleAnswerRequest, store } = setup();
  const { status, body } = await handleAnswerRequest(validAnswerBody());
  assert.equal(status, 200);
  assert.deepEqual(body, {});
  assert.deepEqual(store.answers, [
    {
      module_id: "us-presidents",
      module_version: "1",
      card_id: "george-washington",
      correct: true,
      attempt_number: 0,
    },
  ]);
});

test("handleAnswerRequest silently drops a forged token", async () => {
  const { handleAnswerRequest, store } = setup();
  const { status, body } = await handleAnswerRequest(
    validAnswerBody({ token: "forged-token" }),
  );
  assert.equal(status, 200);
  assert.deepEqual(body, {});
  assert.equal(store.answers.length, 0);
});

test("handleAnswerRequest silently drops a token issued for a different user", async () => {
  const { handleAnswerRequest, store } = setup();
  const token = issueToken(SECRET, "someone-else", TODAY);
  const { status } = await handleAnswerRequest(validAnswerBody({ token }));
  assert.equal(status, 200);
  assert.equal(store.answers.length, 0);
});

test("handleAnswerRequest silently drops once the daily limit is reached", async () => {
  const { handleAnswerRequest, store } = setup({ dailyLimit: 1 });
  await handleAnswerRequest(validAnswerBody());
  const { status } = await handleAnswerRequest(validAnswerBody({ card_id: "abraham-lincoln" }));
  assert.equal(status, 200);
  assert.equal(store.answers.length, 1);
  assert.equal(store.answers[0].card_id, "george-washington");
});

test("handleAnswerRequest silently drops a body missing a required field", async () => {
  const { handleAnswerRequest, store } = setup();
  const body = validAnswerBody();
  delete body.module_id;
  const { status } = await handleAnswerRequest(body);
  assert.equal(status, 200);
  assert.equal(store.answers.length, 0);
});

test("handleAnswerRequest silently drops a negative attempt_number", async () => {
  const { handleAnswerRequest, store } = setup();
  const { status } = await handleAnswerRequest(validAnswerBody({ attempt_number: -1 }));
  assert.equal(status, 200);
  assert.equal(store.answers.length, 0);
});

test("handleAnswerRequest silently drops a non-boolean correct field", async () => {
  const { handleAnswerRequest, store } = setup();
  const { status } = await handleAnswerRequest(validAnswerBody({ correct: "yes" }));
  assert.equal(status, 200);
  assert.equal(store.answers.length, 0);
});

test("handleAnswerRequest silently drops an empty/missing body", async () => {
  const { handleAnswerRequest, store } = setup();
  const { status, body } = await handleAnswerRequest(undefined);
  assert.equal(status, 200);
  assert.deepEqual(body, {});
  assert.equal(store.answers.length, 0);
});
