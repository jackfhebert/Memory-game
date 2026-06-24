const PLAYERS_KEY = "memorygame:players";
export const RECENT_WINDOW_SIZE = 5;
const KNOWN_THRESHOLD = 0.8;

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
  if (!raw) return { itemStats: {} };
  try {
    const progress = JSON.parse(raw);
    if (!progress || typeof progress !== "object" || !progress.itemStats) {
      return { itemStats: {} };
    }
    return progress;
  } catch {
    return { itemStats: {} };
  }
}

export function recordAnswer(player, moduleId, itemId, wasCorrect) {
  const progress = getProgress(player, moduleId);
  const stats = progress.itemStats[itemId] || { recent: [] };
  stats.recent = [...stats.recent, wasCorrect].slice(-RECENT_WINDOW_SIZE);
  progress.itemStats[itemId] = stats;
  localStorage.setItem(progressKey(player, moduleId), JSON.stringify(progress));
  return progress;
}

// "Known" is based on recent answers, not all-time totals, since recent
// behavior predicts future performance better than a lifetime sum does.
export function isItemKnown(stats) {
  if (!stats || stats.recent.length === 0) return false;
  const correctCount = stats.recent.filter(Boolean).length;
  return correctCount / stats.recent.length >= KNOWN_THRESHOLD;
}
