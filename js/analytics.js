// Anonymous, fire-and-forget answer-event tracking. See ANALYTICS.md for the
// full design (token scheme, spam prevention, Firestore schema, CI safety).

const ANALYTICS_ID_KEY = "memorygame:analytics_id";
const TOKEN_KEY = "memorygame:analytics_token";
const TOKEN_DATE_KEY = "memorygame:analytics_token_date";

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

function getOrCreateUserId() {
  const existing = localStorage.getItem(ANALYTICS_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(ANALYTICS_ID_KEY, id);
  return id;
}

function getCachedToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  const date = localStorage.getItem(TOKEN_DATE_KEY);
  if (!token || date !== getUtcDateString()) return null;
  return token;
}

async function fetchToken(userId) {
  const res = await fetch(`${ANALYTICS_ENDPOINT}/analytics/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const { token } = await res.json();
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_DATE_KEY, getUtcDateString());
  return token;
}

async function getToken(userId) {
  return getCachedToken() ?? (await fetchToken(userId));
}

function attemptCountsKey(moduleId, moduleVersion) {
  return `memorygame:attempt_counts:${moduleId}:${moduleVersion}`;
}

function getAttemptCounts(moduleId, moduleVersion) {
  const raw = localStorage.getItem(attemptCountsKey(moduleId, moduleVersion));
  if (!raw) return {};
  try {
    const counts = JSON.parse(raw);
    return counts && typeof counts === "object" ? counts : {};
  } catch {
    return {};
  }
}

function nextAttemptNumber(moduleId, moduleVersion, cardId) {
  return getAttemptCounts(moduleId, moduleVersion)[cardId] ?? 0;
}

function incrementAttemptCount(moduleId, moduleVersion, cardId) {
  const counts = getAttemptCounts(moduleId, moduleVersion);
  counts[cardId] = (counts[cardId] ?? 0) + 1;
  localStorage.setItem(
    attemptCountsKey(moduleId, moduleVersion),
    JSON.stringify(counts),
  );
}

async function sendAnswerEvent(moduleId, moduleVersion, cardId, correct) {
  const userId = getOrCreateUserId();
  const attemptNumber = nextAttemptNumber(moduleId, moduleVersion, cardId);
  const token = await getToken(userId);
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
  incrementAttemptCount(moduleId, moduleVersion, cardId);
}

// Fire-and-forget: never throws, never leaves the caller with a rejected
// promise to handle. A dropped/failed event simply doesn't advance the
// local attempt counter, so the next real attempt is still numbered right.
export function recordAnswerEvent(moduleId, moduleVersion, cardId, correct) {
  if (!isAnalyticsEnabled()) return;
  sendAnswerEvent(moduleId, moduleVersion, cardId, correct).catch(() => {});
}
