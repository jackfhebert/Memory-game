const PLAYERS_KEY = "memorygame:players";
export const RECENT_WINDOW_SIZE = 5;
export const MASTERY_KNOWN_THRESHOLD = 0.8;

// Elo/IRT-style mastery model (see DESIGN.md "Mastery Model"). Drives both
// pacing (via getItemMasteryEstimate/isItemMastered) and the debug panel.
// Tuned up from 0.2/0.5 after live feedback that a kid who already knew an
// answer was still being re-asked it 4+ times before a new card unlocked -
// see test/flashcards.test.js's Animals pacing-measurement test.
const K_ABILITY = 0.5;
const K_ITEM_OFFSET = 2.0;

function progressKey(player, moduleId) {
  return `memorygame:progress:${player}:${moduleId}`;
}

export function getPlayers() {
  const raw = localStorage.getItem(PLAYERS_KEY);
  if (!raw) return [];
  try {
    const players = JSON.parse(raw);
    return Array.isArray(players) ? players : [];
  } catch {
    return [];
  }
}

export function addPlayer(name) {
  const trimmed = name.trim();
  const players = getPlayers();
  if (!trimmed || players.includes(trimmed)) return players;
  const updated = [...players, trimmed];
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(updated));
  return updated;
}

// Stats are recorded against a specific module version (see
// data/modules.json). A stored version that's missing entirely (predates
// versioning) or doesn't match the module's current version means the
// content underneath those stats may have changed, so they're treated as
// no history rather than risking stale stats against new/changed items.
function hasCurrentVersion(progress, version) {
  return typeof progress.version === "string" && progress.version === version;
}

export function getProgress(player, moduleId, version) {
  const raw = localStorage.getItem(progressKey(player, moduleId));
  if (!raw) return { itemStats: {}, ability: 0, version };
  try {
    const progress = JSON.parse(raw);
    if (!progress || typeof progress !== "object" || !progress.itemStats) {
      return { itemStats: {}, ability: 0, version };
    }
    if (!hasCurrentVersion(progress, version)) {
      return { itemStats: {}, ability: 0, version };
    }
    if (typeof progress.ability !== "number") progress.ability = 0;
    return progress;
  } catch {
    return { itemStats: {}, ability: 0, version };
  }
}

function getItemOffset(stats) {
  return typeof stats?.itemOffset === "number" ? stats.itemOffset : 0;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function difficultyFromPopularity(popularity) {
  return (50 - (popularity ?? 0)) / 10;
}

// P(known) per DESIGN.md: sigmoid(ability - difficulty + itemOffset).
// Gives every item a reasonable estimate from popularity alone before it's
// ever been asked, then lets itemOffset diverge from that prior with evidence.
export function probabilityKnown(ability, itemOffset, popularity) {
  return sigmoid(ability - difficultyFromPopularity(popularity) + itemOffset);
}

// P(known) is the latent "does the player actually know this" estimate. The
// flashcard is multiple-choice, so the actual chance of answering correctly
// is higher: even a fully unknown item can be guessed right at a 1/numChoices
// floor. This is display-only - recordAnswer still updates ability/itemOffset
// from P(known) per DESIGN.md, not this guess-adjusted figure.
export function probabilityCorrect(ability, itemOffset, popularity, numChoices) {
  const guessRate = 1 / numChoices;
  return guessRate + (1 - guessRate) * probabilityKnown(ability, itemOffset, popularity);
}

// Pure variant of getMasteryEstimate that takes an already-fetched `progress`
// object instead of reading localStorage, so pacing logic (which already has
// `progress` in hand) doesn't re-fetch it per item.
export function getItemMasteryEstimate(progress, itemId, popularity, numChoices) {
  const ability = progress.ability;
  const itemOffset = getItemOffset(progress.itemStats[itemId]);
  return {
    ability,
    itemOffset,
    difficulty: difficultyFromPopularity(popularity),
    probability: probabilityKnown(ability, itemOffset, popularity),
    probabilityCorrect: probabilityCorrect(ability, itemOffset, popularity, numChoices),
  };
}

export function getMasteryEstimate(player, moduleId, itemId, popularity, numChoices, version) {
  const progress = getProgress(player, moduleId, version);
  return getItemMasteryEstimate(progress, itemId, popularity, numChoices);
}

// "Mastered" is the pacing/progress-chip milestone: the player must have
// actually answered this item at least once (otherwise a popular item's
// prior alone could clear the threshold for a player who's never been
// asked about it), and P(known) must have crossed MASTERY_KNOWN_THRESHOLD.
export function isItemMastered(progress, itemId, popularity) {
  const stats = progress.itemStats[itemId];
  const hasEvidence = Array.isArray(stats?.recent) && stats.recent.length > 0;
  if (!hasEvidence) return false;
  const itemOffset = getItemOffset(stats);
  return probabilityKnown(progress.ability, itemOffset, popularity) >= MASTERY_KNOWN_THRESHOLD;
}

export function recordAnswer(player, moduleId, itemId, wasCorrect, popularity, version) {
  const progress = getProgress(player, moduleId, version);
  const existing = progress.itemStats[itemId];
  // Older profiles may have a pre-recency itemStats shape (no `recent`
  // array) - treat that as no history rather than crashing.
  const recent = Array.isArray(existing?.recent) ? existing.recent : [];
  const itemOffset = getItemOffset(existing);
  const predicted = probabilityKnown(progress.ability, itemOffset, popularity);
  const error = (wasCorrect ? 1 : 0) - predicted;
  const stats = {
    recent: [...recent, wasCorrect].slice(-RECENT_WINDOW_SIZE),
    itemOffset: itemOffset + K_ITEM_OFFSET * error,
  };
  progress.itemStats[itemId] = stats;
  progress.ability += K_ABILITY * error;
  localStorage.setItem(progressKey(player, moduleId), JSON.stringify(progress));
  return progress;
}

