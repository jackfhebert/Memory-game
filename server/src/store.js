import { FieldValue } from "@google-cloud/firestore";

function nextMidnightUtc(dateUtc) {
  const date = new Date(`${dateUtc}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

// Wraps the two Firestore collections in ANALYTICS.md's schema. The
// check-and-increment runs inside one transaction so concurrent requests
// for the same user/day can't both slip past the limit.
export function createFirestoreStore(firestore) {
  async function recordIfUnderLimit(userId, dateUtc, dailyLimit, answerEvent) {
    const rateLimitRef = firestore.collection("rate_limits").doc(`${userId}:${dateUtc}`);
    const answerRef = firestore.collection("answers").doc();

    await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(rateLimitRef);
      const count = snap.exists ? (snap.data().count ?? 0) : 0;
      if (count >= dailyLimit) return;

      tx.set(
        rateLimitRef,
        { count: count + 1, expires: nextMidnightUtc(dateUtc) },
        { merge: true },
      );
      tx.set(answerRef, { ...answerEvent, timestamp: FieldValue.serverTimestamp() });
    });
  }

  return { recordIfUnderLimit };
}
