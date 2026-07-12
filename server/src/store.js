import { FieldValue } from "@google-cloud/firestore";

function nextMidnightUtc(dateUtc) {
  const date = new Date(`${dateUtc}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function statsDocId({ module_id, module_version, card_id, attempt_number }) {
  return `${module_id}:${module_version}:${card_id}:${attempt_number}`;
}

// Wraps the two Firestore collections in ANALYTICS.md's schema.
// Rate-limit check runs in a transaction so concurrent requests for the same
// user/day can't both slip past the limit. The stats increment is a separate
// non-transactional write — FieldValue.increment is atomic on its own, and
// keeping it outside the transaction avoids contention on high-traffic cards.
export function createFirestoreStore(firestore) {
  async function recordIfUnderLimit(userId, dateUtc, dailyLimit, answerEvent) {
    const rateLimitRef = firestore.collection("rate_limits").doc(`${userId}:${dateUtc}`);

    let accepted = false;
    await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(rateLimitRef);
      const count = snap.exists ? (snap.data().count ?? 0) : 0;
      if (count >= dailyLimit) return;
      tx.set(
        rateLimitRef,
        { count: count + 1, expires: nextMidnightUtc(dateUtc) },
        { merge: true },
      );
      accepted = true;
    });

    if (!accepted) return;

    const statsRef = firestore.collection("stats").doc(statsDocId(answerEvent));
    const update = { total: FieldValue.increment(1) };
    if (answerEvent.correct) update.correct = FieldValue.increment(1);
    await statsRef.set(update, { merge: true });
  }

  return { recordIfUnderLimit };
}
