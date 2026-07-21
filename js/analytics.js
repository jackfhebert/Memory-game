// Anonymous, fire-and-forget answer-event tracking. See ANALYTICS.md for the
// full design (token scheme, spam prevention, Firestore schema, CI safety).

// Keyed by player (same convention as js/storage.js's progressKey), not by
// device - siblings sharing one browser are separate anonymous users to the
// server, each with their own rate limit and attempt-number sequence, same
// as they already have separate mastery progress.
function analyticsIdKey(player) {
  return `memorygame:analytics_id:${player}`;
}

function tokenKey(player) {
  return `memorygame:analytics_token:${player}`;
}

function tokenDateKey(player) {
  return `memorygame:analytics_token_date:${player}`;
}

function attemptCountsKey(player, moduleId, moduleVersion) {
  return `memorygame:attempt_counts:${player}:${moduleId}:${moduleVersion}`;
}

// Only the real deployed app should submit events - see ANALYTICS.md
// "CI safety" for why this guard exists and why a hostname check (rather
// than an env var) is the right mechanism for a build-step-free static site.
export const PRODUCTION_HOSTNAME = "memory-game-194124557165.us-central1.run.app";

// TODO: point this at the deployed analytics backend once it exists (see
// ANALYTICS.md "Deployment shape").
export const ANALYTICS_ENDPOINT = "https://memory-game-analytics-194124557165.us-central1.run.app";

function isAnalyticsEnabled() {
  return globalThis.location?.hostname === PRODUCTION_HOSTNAME;
}

function getUtcDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getOrCreateUserId(player) {
  const key = analyticsIdKey(player);
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function getCachedToken(player) {
  const token = localStorage.getItem(tokenKey(player));
  const date = localStorage.getItem(tokenDateKey(player));
  if (!token || date !== getUtcDateString()) return null;
  return token;
}

async function fetchToken(player, userId) {
  const res = await fetch(`${ANALYTICS_ENDPOINT}/analytics/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const { token } = await res.json();
  localStorage.setItem(tokenKey(player), token);
  localStorage.setItem(tokenDateKey(player), getUtcDateString());
  return token;
}

async function getToken(player, userId) {
  return getCachedToken(player) ?? (await fetchToken(player, userId));
}

function getAttemptCounts(player, moduleId, moduleVersion) {
  const raw = localStorage.getItem(attemptCountsKey(player, moduleId, moduleVersion));
  if (!raw) return {};
  try {
    const counts = JSON.parse(raw);
    return counts && typeof counts === "object" ? counts : {};
  } catch {
    return {};
  }
}

function nextAttemptNumber(player, moduleId, moduleVersion, cardId) {
  return getAttemptCounts(player, moduleId, moduleVersion)[cardId] ?? 0;
}

function incrementAttemptCount(player, moduleId, moduleVersion, cardId) {
  const counts = getAttemptCounts(player, moduleId, moduleVersion);
  counts[cardId] = (counts[cardId] ?? 0) + 1;
  localStorage.setItem(
    attemptCountsKey(player, moduleId, moduleVersion),
    JSON.stringify(counts),
  );
}

async function sendAnswerEvent(player, moduleId, moduleVersion, cardId, correct) {
  const userId = getOrCreateUserId(player);
  const attemptNumber = nextAttemptNumber(player, moduleId, moduleVersion, cardId);
  const token = await getToken(player, userId);
  await fetch(`${ANALYTICS_ENDPOINT}/analytics/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      token,
      module_id: moduleId,
      module_version: moduleVersion,
      card_id: cardId,
      correct,
      attempt_number: attemptNumber,
    }),
  });
  // The server always responds 200 whether or not it actually accepted the
  // event (see ANALYTICS.md "Spam Prevention"), so "submit succeeded" from
  // the client's perspective just means the request didn't fail outright.
  incrementAttemptCount(player, moduleId, moduleVersion, cardId);
}

// Fire-and-forget: never throws, never leaves the caller with a rejected
// promise to handle. A dropped/failed event simply doesn't advance the
// local attempt counter, so the next real attempt is still numbered right.
export function recordAnswerEvent(player, moduleId, moduleVersion, cardId, correct) {
  if (!isAnalyticsEnabled()) return;
  sendAnswerEvent(player, moduleId, moduleVersion, cardId, correct).catch(() => {});
}
