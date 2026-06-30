import crypto from "node:crypto";

// See ANALYTICS.md "Spam Prevention": token = HMAC-SHA256(uuid + ":" + date_utc, SERVER_SECRET).
// Binding the date into the signed payload (rather than a separate expiry
// field) is what pins expiry to UTC midnight instead of 24h from issuance.
export function issueToken(secret, userId, dateUtc) {
  return crypto.createHmac("sha256", secret).update(`${userId}:${dateUtc}`).digest("hex");
}

export function isValidToken(secret, userId, token, dateUtc) {
  if (typeof token !== "string" || token.length === 0) return false;
  const expected = issueToken(secret, userId, dateUtc);
  const expectedBuf = Buffer.from(expected, "utf8");
  const tokenBuf = Buffer.from(token, "utf8");
  if (expectedBuf.length !== tokenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, tokenBuf);
}
