# Answer Analytics

## Goal

Track anonymized answer events across all players to build a data-driven signal for card
difficulty. The primary use is **popularity re-estimation**: today's `popularity` values in
each module JSON are hand-tuned guesses. With enough real answer data we can replace them
with empirical measurements of how often players get each card right on their first, second,
and third attempt.

Popularity re-estimation itself is **not built yet** — this document covers only the
collection layer.

---

## Product Requirements

### What We Track

Each answer event records:

| Field | Description |
|---|---|
| `module_id` | Which module (e.g. `us-presidents`) |
| `module_version` | Content version at time of answer — ensures stats don't mix across edits |
| `card_id` | Which card was answered (e.g. `george-washington`) |
| `correct` | Whether the player selected the right answer |
| `attempt_number` | How many times this device has previously answered this card (0 = first ever, 1 = second, …) |
| `timestamp` | Server-side timestamp |

`attempt_number` is the key signal for popularity estimation: a card that 80% of players
get right on attempt 0 is genuinely easy; one where attempt-0 accuracy is 30% is hard
regardless of how famous the subject is.

### What We Don't Track

- **Player name.** The human-readable name in localStorage is never sent to the server.
- **Any PII.** No email, IP address, or device fingerprint is stored.

---

## Anonymous User Identity

On first use, the client generates a random UUID and stores it in localStorage as
`memorygame:analytics_id`. This ID is:

- **Anonymous** — not linked to the player name.
- **Per-device stable** — persists across sessions on the same browser.
- **Rate-limiting only** — not written into Firestore with the answer event, so individual
  answer documents are not linkable back to a device.

---

## Spam Prevention

A game running in a browser with no auth is easy to spam. The goals are:

1. Prevent a single device from flooding the dataset with thousands of answers in a day.
2. Prevent forged submissions that spoof another device's UUID.
3. Fail silently on the client — a rate-limited or invalid submission returns 200 and the
   player never knows.

### Approach: Signed Daily Token + Server-Side Counter

**Token issuance.** Once per calendar day (UTC), the client calls `POST /analytics/token`
with its UUID. The server returns a short-lived HMAC token:

```
token = HMAC-SHA256(uuid + ":" + date_utc, SERVER_SECRET)
```

The client caches `{ token, date }` in localStorage. It re-fetches only when the stored
date no longer matches today.

**Answer submission.** Every answer event is sent to `POST /analytics/answer` with the
token. The server:

1. Re-derives `expected = HMAC-SHA256(uuid + ":" + today, SERVER_SECRET)` and compares
   to the submitted token. Mismatch → 200, drop.
2. Reads the daily counter for this UUID from Firestore (`rate_limits/{uuid}:{date}`).
3. If `count >= DAILY_LIMIT` (suggested: 500) → 200, drop.
4. Otherwise: write the answer event and increment the counter atomically.

**Why this works:**
- The HMAC ties the token to a specific UUID and a specific day. A token issued today
  cannot be replayed tomorrow.
- A device can't submit under someone else's UUID without their token.
- The server never trusts the client's claim about how many answers it has submitted.

---

## Firestore Schema

### `answers` collection

Auto-ID documents. One document per accepted answer event.

```
{
  module_id:      string,      // "us-presidents"
  module_version: string,      // "2"
  card_id:        string,      // "george-washington"
  correct:        boolean,
  attempt_number: number,      // 0-indexed; 0 = first time this device answered this card
  timestamp:      Timestamp    // server-set
}
```

`user_id` is intentionally absent — it is used only for rate limiting and not persisted
with the event, keeping individual documents anonymous.

### `rate_limits` collection

Document ID: `{uuid}:{date_utc}` (e.g. `a3f2…:2026-06-30`).

```
{
  count: number,
  expires: Timestamp   // next midnight UTC; used for TTL-based cleanup
}
```

---

## Future: Popularity Re-estimation

Not in scope now. When built, a periodic job will:

1. Query `answers` grouped by `(module_id, module_version, card_id)`.
2. Compute attempt-0 correct rate for each card.
3. Map that rate to a new `popularity` value and write it back to the module JSON.

Stats should only be used once enough answers have accumulated (suggested minimum: 50
attempt-0 answers per card).

---

## Code to Write

### 1. `js/analytics.js` (new client module)

Responsibilities:
- Read or generate the anonymous UUID from `memorygame:analytics_id` in localStorage.
- Fetch and cache the daily HMAC token from the backend (`POST /analytics/token`).
  Cache as `memorygame:analytics_token` + `memorygame:analytics_token_date`; re-fetch
  when the stored date != today (UTC).
- Track per-card attempt counts locally in localStorage
  (`memorygame:attempt_counts:{moduleId}:{moduleVersion}`) so that `attempt_number` can
  be computed client-side before submitting.
- Export a single function:
  ```js
  recordAnswerEvent(moduleId, moduleVersion, cardId, correct)
  ```
  This is **fire-and-forget**: it never throws, never awaits user interaction, and any
  network or server error is swallowed silently.

### 2. Integration in `js/flashcards.js`

Call `recordAnswerEvent(...)` in `onNext()` alongside the existing `recordAnswer()` call.
No changes to the return value or control flow — analytics is purely a side effect.

### 3. Backend handler

A single Cloud Run service (or Cloud Function) with two endpoints:

**`POST /analytics/token`**
- Body: `{ user_id: string }`
- Generates and returns `{ token: string }` — the HMAC for today.
- No Firestore writes; purely computational.
- Should be callable by any origin (CORS open).

**`POST /analytics/answer`**
- Body: `{ user_id, token, module_id, module_version, card_id, correct, attempt_number }`
- Validates the HMAC token.
- Reads/increments the rate-limit counter in `rate_limits`.
- On success, writes to `answers` with a server-set timestamp.
- Always returns 200 (rate-limited or invalid submissions are silently dropped).

### 4. Firestore setup

- Enable Firestore in Native mode on the existing GCP project.
- Security rules: deny all client-side reads and writes; only the backend service account
  has write access.
- Enable TTL on `rate_limits.expires` to auto-delete old counters.

### 5. Infrastructure / config

- `SERVER_SECRET`: stored as a Cloud Run/Cloud Function environment secret (not in source).
- `DAILY_LIMIT`: configurable env var, default 500.
- CORS: backend should allow requests from the game's origin only in production.
- The backend URL needs to be baked into the client (env var at build time, or a
  hardcoded constant in `analytics.js`).
