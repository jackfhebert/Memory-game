import { issueToken, isValidToken } from "./token.js";

function utcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function isValidAnswerBody(body) {
  return (
    body &&
    typeof body.user_id === "string" &&
    body.user_id.length > 0 &&
    typeof body.module_id === "string" &&
    body.module_id.length > 0 &&
    typeof body.module_version === "string" &&
    body.module_version.length > 0 &&
    typeof body.card_id === "string" &&
    body.card_id.length > 0 &&
    typeof body.correct === "boolean" &&
    Number.isInteger(body.attempt_number) &&
    body.attempt_number >= 0
  );
}

// `store` only needs one method: atomically check-and-increment the day's
// counter and, if under the limit, persist the event. Keeping that as a
// single call lets the real Firestore implementation do it inside one
// transaction, and lets tests fake it with a plain in-memory counter.
export function createHandlers({ secret, dailyLimit, store, now = () => new Date() }) {
  async function handleTokenRequest(body) {
    const userId = body?.user_id;
    if (typeof userId !== "string" || userId.length === 0) {
      return { status: 400, body: { error: "user_id required" } };
    }
    const token = issueToken(secret, userId, utcDateString(now()));
    return { status: 200, body: { token } };
  }

  // Always responds 200 - invalid token, unknown user, and rate-limited
  // requests all drop silently. See ANALYTICS.md "Spam Prevention".
  async function handleAnswerRequest(body) {
    const dateUtc = utcDateString(now());
    const valid =
      isValidAnswerBody(body) && isValidToken(secret, body.user_id, body.token, dateUtc);

    if (valid) {
      await store.recordIfUnderLimit(body.user_id, dateUtc, dailyLimit, {
        module_id: body.module_id,
        module_version: body.module_version,
        card_id: body.card_id,
        correct: body.correct,
        attempt_number: body.attempt_number,
      });
    }

    return { status: 200, body: {} };
  }

  return { handleTokenRequest, handleAnswerRequest };
}
