import { test } from "node:test";
import assert from "node:assert/strict";
import { issueToken, isValidToken } from "../src/token.js";

const SECRET = "test-secret";
const TODAY = "2026-06-30";

test("isValidToken accepts a token issued for the same user and date", () => {
  const token = issueToken(SECRET, "user-1", TODAY);
  assert.equal(isValidToken(SECRET, "user-1", token, TODAY), true);
});

test("isValidToken rejects a token issued for a different user", () => {
  const token = issueToken(SECRET, "user-1", TODAY);
  assert.equal(isValidToken(SECRET, "user-2", token, TODAY), false);
});

test("isValidToken rejects a token from a previous day", () => {
  const token = issueToken(SECRET, "user-1", "2026-06-29");
  assert.equal(isValidToken(SECRET, "user-1", token, TODAY), false);
});

test("isValidToken rejects a token signed with a different secret", () => {
  const token = issueToken("wrong-secret", "user-1", TODAY);
  assert.equal(isValidToken(SECRET, "user-1", token, TODAY), false);
});

test("isValidToken rejects a forged token of the right length", () => {
  const forged = "a".repeat(64);
  assert.equal(isValidToken(SECRET, "user-1", forged, TODAY), false);
});

test("isValidToken rejects a missing or empty token", () => {
  assert.equal(isValidToken(SECRET, "user-1", undefined, TODAY), false);
  assert.equal(isValidToken(SECRET, "user-1", "", TODAY), false);
});
