// In-memory stand-in for the Firestore-backed store (server/src/store.js),
// so handler tests don't need a real Firestore emulator.
export function createFakeStore() {
  const counts = new Map();
  // stats keyed by "{module_id}:{module_version}:{card_id}:{attempt_number}"
  const stats = new Map();

  return {
    stats,
    async recordIfUnderLimit(userId, dateUtc, dailyLimit, answerEvent) {
      const key = `${userId}:${dateUtc}`;
      const count = counts.get(key) ?? 0;
      if (count >= dailyLimit) return;
      counts.set(key, count + 1);

      const { module_id, module_version, card_id, attempt_number, correct } = answerEvent;
      const statsKey = `${module_id}:${module_version}:${card_id}:${attempt_number}`;
      const existing = stats.get(statsKey) ?? { correct: 0, total: 0 };
      stats.set(statsKey, {
        correct: existing.correct + (correct ? 1 : 0),
        total: existing.total + 1,
      });
    },
  };
}
