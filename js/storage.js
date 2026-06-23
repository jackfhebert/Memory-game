const PLAYERS_KEY = "memorygame:players";

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
  const stats = progress.itemStats[itemId] || { shown: 0, correct: 0 };
  stats.shown += 1;
  if (wasCorrect) stats.correct += 1;
  progress.itemStats[itemId] = stats;
  localStorage.setItem(progressKey(player, moduleId), JSON.stringify(progress));
  return progress;
}
