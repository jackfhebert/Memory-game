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

For each unique `(module_id, module_version, card_id, attempt_number)` combination, the
server maintains a running tally:

| Field | Description |
|---|---|
| `module_id` | Which module (e.g. `us-presidents`) |
| `module_version` | Content version — ensures stats don't mix across edits to a card |
| `card_id` | Which card was answered (e.g. `george-washington`) |
| `attempt_number` | How many times this device has previously answered this card (0 = first ever, 1 = second, …) |
| `correct` | Running count of correct answers for this combination |
| `total` | Running count of all answers for this combination |

`attempt_number` is the key signal for popularity estimation: a card that 80% of players
get right on attempt 0 is genuinely easy; one where attempt-0 accuracy is 30% is hard
regardless of how famous the subject is. Accuracy is `correct / total`.

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

**Expiry is pinned to midnight UTC, not 24 hours after issuance.** Because `date_utc` is
the calendar date (e.g. `2026-06-30`), the token is only ever valid for that one UTC day —
a token issued at 11:58 PM UTC expires two minutes later, while one issued just after
midnight is good for nearly 24 hours. This is intentional: it keeps the token's validity
window identical to the rate-limit counter's window (see `rate_limits` below), so the two
always reset together. The slightly uneven window length is harmless for a kids' game.

**Renewal is lazy, not proactive.** The client caches `{ token, date }` in localStorage
(`memorygame:analytics_token`, `memorygame:analytics_token_date`). Before every answer
submission, it compares the cached `date` to today's UTC date:

- **Match** → reuse the cached token, no network call.
- **Mismatch** (first answer after midnight, or first-ever use) → call
  `POST /analytics/token` to fetch a fresh token, cache it with today's date, then proceed.

There's no timer or background refresh — the check happens inline as part of submitting
an answer, so a device that's idle over midnight does nothing until the player answers
another card.

**Answer submission.** Every answer event is sent to `POST /analytics/answer` with the
token. The server:

1. Re-derives `expected = HMAC-SHA256(uuid + ":" + today, SERVER_SECRET)` and compares
   to the submitted token. Mismatch → 200, drop.
2. Reads the daily counter for this UUID from Firestore (`rate_limits/{uuid}:{date}`).
3. If `count >= DAILY_LIMIT` (suggested: 500) → 200, drop.
4. Otherwise: increment `stats/{module_id}:{module_version}:{card_id}:{attempt_number}` counters and increment the rate-limit counter atomically.

**Why this works:**
- The HMAC ties the token to a specific UUID and a specific day. A token issued today
  cannot be replayed tomorrow.
- A device can't submit under someone else's UUID without their token.
- The server never trusts the client's claim about how many answers it has submitted.

---

## Firestore Schema

### `stats` collection

Document ID: `{module_id}:{module_version}:{card_id}:{attempt_number}`
(e.g. `us-presidents:2026-06-27T00:00:00Z:george-washington:0`).

```
{
  correct: number,   // incremented when the answer was correct
  total:   number    // incremented on every accepted answer
}
```

Accuracy for a given card and attempt slot is `correct / total`. No auto-ID or
timestamp fields — counters are updated in place with `FieldValue.increment`, so
there is exactly one document per `(module_id, module_version, card_id, attempt_number)`
combination regardless of how many players have answered it. `user_id` is never stored
here — it is used only for rate limiting.

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

1. Read `stats` documents where the ID ends in `:0` (attempt-0 answers).
2. Compute `correct / total` for each `(module_id, module_version, card_id)`.
3. Map that rate to a new `popularity` value and write it back to the module JSON.

Stats should only be used once enough answers have accumulated (suggested minimum: 50
attempt-0 answers per card). Because each combination has exactly one document, the
query is a simple collection scan with no grouping step.

---

## Code to Write

### New files

| File | Purpose |
|---|---|
| `js/analytics.js` | Client module — identity, token cache, attempt counting, `recordAnswerEvent()` |
| `test/analytics.test.js` | Unit tests for the client module (mocking `fetch` and localStorage, same pattern as `test/storage.test.js`) |
| `server/index.js` (or `functions/analytics/index.js`) | Backend handler — see below for which platform |
| `server/package.json` | Backend's own dependencies (`firebase-admin` or `@google-cloud/firestore`), separate from the static-site `package.json` |
| `firestore.rules` | Security rules: deny all client reads/writes |
| `firestore.indexes.json` | Only needed once popularity re-estimation queries by `module_id`+`module_version`+`card_id` — not required for this phase |

### Modified files

| File | Change |
|---|---|
| `js/flashcards.js` | In `onNext()`, call `recordAnswerEvent(moduleId, moduleVersion, card.item.id, wasCorrect)` alongside the existing `recordAnswer()` call. Fire-and-forget — no change to control flow or return values. |
| `Dockerfile` | Unchanged if the backend is a separate Cloud Run service/Cloud Function. If folded into the same nginx container, would need an nginx `location` proxy block — **not recommended**, see "Deployment shape" below. |

### `js/analytics.js` responsibilities

- Read or generate the anonymous UUID from `memorygame:analytics_id` in localStorage.
- Fetch and cache the daily HMAC token per the renewal rules above.
- Track per-card attempt counts locally in localStorage
  (`memorygame:attempt_counts:{moduleId}:{moduleVersion}`) so `attempt_number` can be
  computed client-side before submitting, then incremented after a successful submit.
- Export a single function:
  ```js
  recordAnswerEvent(moduleId, moduleVersion, cardId, correct)
  ```
  Fire-and-forget: never throws, never awaited by the caller, swallows all network/server
  errors internally.

### Backend handler

Two endpoints, regardless of hosting platform (see below):

**`POST /analytics/token`**
- Body: `{ user_id: string }`
- Returns `{ token: string }` — today's HMAC for that UUID.
- No Firestore access; purely computational.
- CORS: open (any origin can request a token; tokens are useless without also passing
  rate limiting on `/analytics/answer`).

**`POST /analytics/answer`**
- Body: `{ user_id, token, module_id, module_version, card_id, correct, attempt_number }`
- Validates the HMAC token against today's UTC date.
- Reads/increments the day's counter in `rate_limits/{user_id}:{date}` (Firestore
  transaction or `FieldValue.increment`).
- On success, increments `correct` (if correct) and `total` on `stats/{module_id}:{module_version}:{card_id}:{attempt_number}` using `FieldValue.increment`.
- Always responds `200` — rate-limited and invalid-token cases drop silently.

### Deployment shape — decision needed

The existing app is a single nginx-on-Cloud-Run static file server (see `Dockerfile`).
Two ways to add the backend:

1. **New, separate Cloud Run service** (recommended) — a small Node/Express (or plain
   `http`) server deployed independently, e.g. `memory-game-analytics`. Keeps the static
   site simple and lets the backend scale/redeploy independently. The client calls its
   full URL directly (CORS, not same-origin).
2. **Cloud Functions (2nd gen)** — same effective behavior as #1 but no Dockerfile/server
   process to manage, billed per-invocation. Simpler for a low-traffic kids' game.

Either way, the static site's `Dockerfile`/nginx config doesn't change.

### GCP setup (manual, one-time)

- **Enable APIs**: Firestore API (`firestore.googleapis.com`), and if going the Cloud
  Functions route, Cloud Functions API + Cloud Build API + Artifact Registry API.
- **Create Firestore database** in Native mode, same project as the existing Cloud Run
  service, in `us-central1` to match.
- **Security rules**: deny-all for client SDK access — all reads/writes happen through
  the backend's service account, never directly from the browser.
- **Secret**: `SERVER_SECRET` for HMAC signing, stored in Secret Manager and mounted as
  an env var on the backend service/function — never committed to source.
- **IAM**: backend's runtime service account needs `roles/datastore.user` on the project.

### Config / constants

- `DAILY_LIMIT` — env var on the backend, default 500.
- Backend base URL — baked into `js/analytics.js` as a constant (this is a static site
  with no build step, so it can't be injected at build time the way a bundler would;
  a plain exported `const ANALYTICS_ENDPOINT = "https://..."` is consistent with how
  the rest of the codebase already hardcodes things like `POINTS_SCALE`).
- `PRODUCTION_HOSTNAME` — `js/analytics.js` only sends events when
  `location.hostname` matches this constant. This is what keeps CI and local
  dev from polluting the real dataset (see "CI safety" below) without needing
  an env var or build step to distinguish environments.

### CI safety

`test/browser/click-and-render.mjs` (the real-rendering browser check, see
TESTING.md) clicks through a real answer, hitting the same `onNext()` code
path in `js/flashcards.js` that production traffic uses. That check runs in
GitHub Actions, which has normal network access, and serves the app on
`127.0.0.1` — so without a guard, every CI run would submit a real (if
synthetic) answer to the live `stats`/`rate_limits` collections.

`recordAnswerEvent` avoids this by checking `location.hostname ===
PRODUCTION_HOSTNAME` before doing anything else — no UUID lookup, no token
fetch, no network call. CI (`127.0.0.1`) and local dev (`localhost` or a
LAN IP) both fail that check and silently no-op, the same way a dropped
answer does. This needs no env var or build-time substitution, so it works
for a static site with no build step.
