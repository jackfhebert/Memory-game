// In-memory stand-in for the Firestore-backed store (server/src/store.js),
// so handler tests don't need a real Firestore emulator.
export function createFakeStore() {
  const counts = new Map();
  const answers = [];

  return {
    answers,
    async recordIfUnderLimit(userId, dateUtc, dailyLimit, answerEvent) {
      const key = `${userId}:${dateUtc}`;
      const count = counts.get(key) ?? 0;
      if (count >= dailyLimit) return;
      counts.set(key, count + 1);
      answers.push(answerEvent);
    },
  };
}
