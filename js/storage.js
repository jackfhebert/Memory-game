const PLAYERS_KEY = "memorygame:players";
export const RECENT_WINDOW_SIZE = 5;
const POPULAR_THRESHOLD = 50;
const STREAK_OVERRIDE = 3;

// Elo/IRT-style mastery model (see DESIGN.md "Mastery Model"). Separate from
// the recent-streak `isItemKnown` signal above, which still drives pacing;
// this feeds the player-strength estimate shown in the debug panel.
const K_ABILITY = 0.2;
const K_ITEM_OFFSET = 0.5;

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

export function getProgress(player, moduleId) {
  const raw = localStorage.getItem(progressKey(player, moduleId));
  if (!raw) return { itemStats: {}, ability: 0 };
  try {
    const progress = JSON.parse(raw);
    if (!progress || typeof progress !== "object" || !progress.itemStats) {
      return { itemStats: {}, ability: 0 };
    }
    if (typeof progress.ability !== "number") progress.ability = 0;
    return progress;
  } catch {
    return { itemStats: {}, ability: 0 };
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

export function getMasteryEstimate(player, moduleId, itemId, popularity) {
  const progress = getProgress(player, moduleId);
  const ability = progress.ability;
  const itemOffset = getItemOffset(progress.itemStats[itemId]);
  return {
    ability,
    itemOffset,
    difficulty: difficultyFromPopularity(popularity),
    probability: probabilityKnown(ability, itemOffset, popularity),
  };
}

export function recordAnswer(player, moduleId, itemId, wasCorrect, popularity) {
  const progress = getProgress(player, moduleId);
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

function trailingCorrectStreak(recent) {
  let streak = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i]; i--) {
    streak += 1;
  }
  return streak;
}

// "Known" is based on recent answers plus the item's popularity, not a
// lifetime sum: a popular item only needs one correct answer to count as
// known, an unpopular one needs two, and a run of mixed results needs a
// fresh streak of 3 in a row to override the earlier misses.
export function isItemKnown(stats, popularity) {
  if (!stats || !Array.isArray(stats.recent) || stats.recent.length === 0) return false;
  const recent = stats.recent;
  if (trailingCorrectStreak(recent) >= STREAK_OVERRIDE) return true;
  if (recent.every(Boolean)) {
    const required = popularity >= POPULAR_THRESHOLD ? 1 : 2;
    return recent.length >= required;
  }
  return false;
}
