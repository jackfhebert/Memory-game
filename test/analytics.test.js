import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeStorage } from "./helpers/fakeStorage.js";

const {
  recordAnswerEvent,
  PRODUCTION_HOSTNAME,
  ANALYTICS_ENDPOINT,
} = await import("../js/analytics.js");

const ANALYTICS_ID_KEY = "memorygame:analytics_id";
const TOKEN_KEY = "memorygame:analytics_token";
const TOKEN_DATE_KEY = "memorygame:analytics_token_date";

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

// recordAnswerEvent is fire-and-forget: it kicks off a promise chain the
// caller never awaits. Tests need to let that chain's microtasks drain
// before asserting on its side effects - a macrotask boundary (setTimeout)
// is enough since it always runs after any pending microtasks.
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, body });
    return handler(url, body);
  };
  fn.calls = calls;
  return fn;
}

function defaultHandler(url) {
  if (url.endsWith("/analytics/token")) {
    return { ok: true, json: async () => ({ token: "fake-token" }) };
  }
  return { ok: true, json: async () => ({}) };
}

beforeEach(() => {
  globalThis.localStorage = createFakeStorage();
  globalThis.location = { hostname: PRODUCTION_HOSTNAME };
});

test("does nothing off the production host", async () => {
  globalThis.location = { hostname: "127.0.0.1" };
  globalThis.fetch = fakeFetch(defaultHandler);
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();
  assert.equal(globalThis.fetch.calls.length, 0);
  assert.equal(localStorage.getItem(ANALYTICS_ID_KEY), null);
});

test("never throws synchronously, even when fetch rejects", () => {
  globalThis.fetch = () => Promise.reject(new Error("network down"));
  assert.doesNotThrow(() => {
    recordAnswerEvent("us-presidents", "1", "george-washington", true);
  });
});

test("swallows a token-fetch failure without submitting an answer", async () => {
  globalThis.fetch = fakeFetch(() => Promise.reject(new Error("network down")));
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();
  const answerCalls = globalThis.fetch.calls.filter((c) => c.url.endsWith("/analytics/answer"));
  assert.equal(answerCalls.length, 0);
});

test("swallows an answer-submit failure and does not advance the attempt counter", async () => {
  globalThis.fetch = fakeFetch((url) => {
    if (url.endsWith("/analytics/token")) {
      return { ok: true, json: async () => ({ token: "fake-token" }) };
    }
    return Promise.reject(new Error("network down"));
  });
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();

  globalThis.fetch = fakeFetch(defaultHandler);
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();
  const [{ body }] = globalThis.fetch.calls.filter((c) => c.url.endsWith("/analytics/answer"));
  assert.equal(body.attempt_number, 0);
});

test("generates an anonymous user id once and reuses it", async () => {
  globalThis.fetch = fakeFetch(defaultHandler);
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();
  const firstId = localStorage.getItem(ANALYTICS_ID_KEY);
  assert.ok(firstId, "expected a user id to be persisted");

  recordAnswerEvent("us-presidents", "1", "abraham-lincoln", true);
  await flush();
  assert.equal(localStorage.getItem(ANALYTICS_ID_KEY), firstId);

  const answerCalls = globalThis.fetch.calls.filter((c) => c.url.endsWith("/analytics/answer"));
  assert.equal(answerCalls[0].body.user_id, firstId);
  assert.equal(answerCalls[1].body.user_id, firstId);
});

test("posts module/card/correctness fields and attempt_number 0 on first answer", async () => {
  globalThis.fetch = fakeFetch(defaultHandler);
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();
  const [{ url, body }] = globalThis.fetch.calls.filter((c) => c.url.endsWith("/analytics/answer"));
  assert.equal(url, `${ANALYTICS_ENDPOINT}/analytics/answer`);
  assert.equal(body.module_id, "us-presidents");
  assert.equal(body.module_version, "1");
  assert.equal(body.card_id, "george-washington");
  assert.equal(body.correct, true);
  assert.equal(body.attempt_number, 0);
  assert.equal(body.token, "fake-token");
});

test("increments attempt_number per card after a successful submit", async () => {
  globalThis.fetch = fakeFetch(defaultHandler);
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();
  recordAnswerEvent("us-presidents", "1", "george-washington", false);
  await flush();
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();

  const answerCalls = globalThis.fetch.calls.filter((c) => c.url.endsWith("/analytics/answer"));
  assert.deepEqual(answerCalls.map((c) => c.body.attempt_number), [0, 1, 2]);
});

test("tracks attempt_number independently per card", async () => {
  globalThis.fetch = fakeFetch(defaultHandler);
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();
  recordAnswerEvent("us-presidents", "1", "abraham-lincoln", true);
  await flush();

  const answerCalls = globalThis.fetch.calls.filter((c) => c.url.endsWith("/analytics/answer"));
  assert.equal(answerCalls[0].body.attempt_number, 0);
  assert.equal(answerCalls[1].body.attempt_number, 1);
  assert.equal(answerCalls[2].body.attempt_number, 0);
});

test("resets attempt_number when the module version changes", async () => {
  globalThis.fetch = fakeFetch(defaultHandler);
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();
  recordAnswerEvent("us-presidents", "2", "george-washington", true);
  await flush();

  const answerCalls = globalThis.fetch.calls.filter((c) => c.url.endsWith("/analytics/answer"));
  assert.equal(answerCalls[0].body.attempt_number, 0);
  assert.equal(answerCalls[1].body.attempt_number, 0);
});

test("reuses a same-day cached token without a second token fetch", async () => {
  globalThis.fetch = fakeFetch(defaultHandler);
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();
  recordAnswerEvent("us-presidents", "1", "abraham-lincoln", true);
  await flush();

  const tokenCalls = globalThis.fetch.calls.filter((c) => c.url.endsWith("/analytics/token"));
  assert.equal(tokenCalls.length, 1);
  assert.equal(localStorage.getItem(TOKEN_DATE_KEY), todayUtc());
});

test("re-fetches the token when the cached date doesn't match today", async () => {
  localStorage.setItem(TOKEN_KEY, "stale-token");
  localStorage.setItem(TOKEN_DATE_KEY, "2000-01-01");
  globalThis.fetch = fakeFetch(defaultHandler);
  recordAnswerEvent("us-presidents", "1", "george-washington", true);
  await flush();

  const tokenCalls = globalThis.fetch.calls.filter((c) => c.url.endsWith("/analytics/token"));
  assert.equal(tokenCalls.length, 1);
  const [{ body }] = globalThis.fetch.calls.filter((c) => c.url.endsWith("/analytics/answer"));
  assert.equal(body.token, "fake-token");
});
