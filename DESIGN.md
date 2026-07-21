# Design Doc — Memory Game

See also: [README](README.md) ·
[Implementation Plan](IMPLEMENTATION_PLAN.md) ·
[Production Overview](PRODUCTION.md)

## Vision

This started from watching the World Cup with my kids and realizing they
didn't know the countries playing. The goal of this app is to teach kids
simple, fun facts about the world — starting with geography basics
(continents, oceans, U.S. states) and later branching into lighter topics
(sushi, pasta, etc.).

The eventual hope, per item, is that a kid can: pronounce its name, point to
it on a map, and tell you a fun fact about it. The MVP focuses on the first
step of that — recognizing the name and learning a fact — with
pronunciation and map-pointing as later additions.

This is a home learning toy, not a product. No accounts, no passwords, no
real security — just enough player separation that siblings don't mix up
progress.

## MVP Scope

- **One device, browser-based, no backend.** A static HTML/CSS/JS app, run
  locally or hosted as static files. No server, no database.
- **Content lives in JSON files**, one per module, checked into the repo
  alongside images.
- **Player progress lives in browser localStorage** — it doesn't follow a
  kid between devices, and is lost if browser data is cleared. Acceptable
  for an MVP on one shared family device.
- **First two modules: Continents and Oceans.** Each is its own module file
  (7 continents, 5 oceans) — starting with two separate modules from day
  one proves out both the core flashcard loop and module-to-module
  switching, before adding bigger content sets like U.S. states or World
  Cup countries.

### Explicitly out of scope for MVP

- Audio pronunciation playback (speaker button reading the name aloud).
- A dedicated "find it on a map" interactive mode, separate from using a
  map image as the card's picture.
- Modules beyond Continents and Oceans (U.S. states, World Cup countries,
  sushi, pasta, etc.).
- Cross-device synced progress / any backend or accounts.

These are captured here so they aren't lost, and so future modules/features
have an obvious place to slot in later.

## Players

- On launch, the kid picks their name from a list of existing players (read
  from localStorage) or types a new name to create one.
- No password, no PIN, no profile pictures for MVP — just a name.
- All progress is stored under that name in localStorage, so each kid's
  mastery scores stay separate.

## Modules

A **module** is one topic's full content set (e.g. "Continents"). Each
module is a JSON file listing its items.

Item schema:

```json
{
  "id": "africa",
  "name": "Africa",
  "image": "images/continents/africa.png",
  "alt": "A world map with a large landmass highlighted, straddling the equator.",
  "fact": "Home to the Sahara, the largest hot desert in the world.",
  "popularity": 90
}
```

- `image` — for geography modules, this is a world map with the item
  highlighted (e.g. Africa's outline highlighted on a world map), not a
  generic photo. This is how "find it on a map" sneaks into the MVP without
  being a separate game mode. These maps are rendered programmatically
  from public geographic datasets (see
  [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)) rather than AI-generated
  or sourced from an existing library, keeping the pipeline self-contained
  and easy to regenerate or extend to new modules. Non-geography modules
  (Animals, Pasta Shapes) instead use a real sourced photo per item, since
  there's no map to render and a real-world photo exists.
- `alt` — alt text describing what the image shows, for accessibility.
  Like `fact`, it must not name the item — for geography modules it
  describes the highlighted shape/location rather than what it's called,
  so it can't be used to shortcut the guess.
- `fact` (or `facts`, an array — items can have more than one, with one
  picked at random per card) — a short, kid-friendly sentence describing
  the item without naming it, so the guess still requires connecting the
  picture and fact to a name rather than just spotting the name written
  out.
- `popularity` — a 0–100 prior estimate of how well-known the item is to
  most people. This is authored once per item (not per player) and feeds
  both the introduction order and the initial mastery estimate (see
  Mastery Model below).

Content for Continents and Oceans will be drafted as placeholder JSON
(facts + popularity estimates) with AI-generated map images, so the app is
playable end-to-end before any real content review.

## Recall Variants

Recognizing an item from its picture *and* its fact together is a first
step, not the goal — the next step is confirming a player can do it from
either cue alone, without the other propping it up. A module can include
extra **recall variant** entries per item: the same answer, but with
either the image or the fact stripped out, so the guess has to come from a
single cue instead of two combined.

A recall variant is a normal item entry, distinguished by a `variantOf`
field:

```json
{
  "id": "africa-image-only",
  "name": "Africa",
  "variantOf": "africa",
  "image": "images/continents/africa.png",
  "alt": "A world map with a large landmass highlighted, straddling the equator with hot desert across its northern half.",
  "popularity": 90
}
```

- `variantOf` — the `id` of the full item this variant is testing recall
  for. Marks the entry as a variant rather than a standalone item, and
  ties its `name` back to the base item for distractor purposes (see
  Distractor Selection below).
- Exactly one of (`image` + `alt`) or (`fact`/`facts`) is present on a
  variant — never both omitted. There's always one cue to recall from; a
  card with neither would just be a random guess among the four name
  buttons, which teaches nothing.
- When `image`/`alt` are omitted, the card shows a placeholder image
  instead of blank space — a "?" graphic, one per module (e.g.
  `images/continents/_placeholder.svg`), styled to match that module's art
  rather than one generic graphic shared across all modules. Its alt text
  is a generic "Image hidden for this card," not the real item `alt`, so
  it can't be used as a shape hint.
- When `fact`/`facts` are omitted, no fact paragraph is shown at all.
- `popularity` — authored lower than the base item's, since recognizing
  from a single cue is inherently harder than from picture + fact
  together. This also keeps a variant out of the active pool (sorted by
  popularity, see Adaptive Pacing) until after its base item has already
  entered, instead of both competing for pool slots from the start.

Recall variants aren't gated behind the base item being mastered first —
they're blended into the active pool alongside it like any other item
(see Adaptive Pacing), so a player can hit the harder, single-cue version
of an item even while still learning the full one.

Module totals and the "X of Y known" progress chip count by unique
`name`, not raw entries, so a module with variants still shows its true
number of real-world items (e.g. "3 of 7 known" for Continents, not "3 of
21"). This is computed by deduping entries by `name` and keeping the
first occurrence in file order; that first entry's mastery state decides
whether the name counts toward "known." In practice this means the base
item — which should be listed before its variants in the module JSON —
determines the chip; variants add extra practice reps but don't
independently move it. Module authors need to keep the base entry first,
ahead of its variants, for this ordering to hold.

## Game Flow

1. **Player Select** — pick an existing name or create a new one.
2. **Module Select** — pick a module (Continents, Oceans), shown with a
   rough progress indicator (e.g. "3 of 7 known"). Tapping a module starts
   the Flashcard Mode loop directly, in Active Learning pacing (see
   Adaptive Pacing below) — items are introduced gradually as the player
   demonstrates mastery.
3. **Flashcard Mode** (the core loop):
   1. The app picks the next item from the player's active pool for that
      module (see Adaptive Pacing).
   2. **Card front:** picture + fun fact shown together, plus 4
      multiple-choice name buttons (1 correct, 3 distractors from the same
      module, random order). Showing the fact before the guess means it
      doubles as a hint — intentional, since the goal is learning, not
      testing.
   3. The kid taps a choice.
   4. **Card flips** to reveal the correct name (highlighted) and whether
      their tap was right or wrong. A correct answer also triggers a brief,
      non-blocking firework-burst animation (`js/effects.js`) centered on
      the correct-answer button — purely celebratory, never delays the
      "Next" flow.
   5. Kid taps "Next" to continue.
   6. A running tally stays visible during the session: two labeled,
      colored chips — "⭐ N Correct" and "🔁 N Try Again" — update after
      each answer, giving the kid an at-a-glance sense of how the session's
      going without it feeling like a test score. A correct answer also
      shows a third "✨ +N" chip with the points earned for that answer (see
      Session Points below).
4. This repeats indefinitely, cycling through the active pool. An "X" is
   always visible during Flashcard Mode so the kid can exit back to Module
   Select whenever they're done — there's no separate "finished" state to
   design for.

## Session Points

A separate, cross-module running total — distinct from the per-module
"⭐ N Correct" tally above — meant for a parent to set a goal against (e.g.
"play until you hit 50 points"), regardless of which module(s) the kid
switches between to get there.

- **Points per correct answer** are based on how much that answer moved the
  mastery model's belief about the item, not a flat amount: `points =
  max(1, round((P(known)_after - P(known)_before) * 100))`, computed in
  `js/flashcards.js` (`pointsForAnswer`) from the same `P(known)` estimates
  the Mastery Model already produces. Correctly answering an item the model
  was unsure about is worth more than confirming an already-near-certain
  one; the floor of 1 keeps every correct answer feeling positive even when
  the move is negligible. A wrong answer earns 0 points (never negative) —
  consistent with the tally above, this stays encouragement, not a test
  score.
- **Tracked across modules**, not reset on a module switch: the running
  total lives in `js/app.js` (`state.sessionPoints`), accumulated via an
  `onPointsEarned` callback passed into `startFlashcardSession`. It resets
  to 0 only when a player is (re)selected at Player Select.
- **Displayed in two places:** the "✨ +N" chip on the just-answered card
  (per-answer, in `js/flashcards.js`) and a persistent "⭐ N points" bar
  fixed to the bottom of the viewport, visible on every screen once a
  player is chosen (`#session-points-bar` in `index.html`, rendered by
  `js/app.js`).

## Mastery Model

Two distinct ideas feed into how the game decides what a player knows:

- **Popularity** (`popularity`, 0–100) — authored per item, shared by all
  players. A prior belief about how likely *anyone* is to already know this
  item, before they've ever been asked about it.
- **Ability** (per player, per module) — a single running estimate of how
  strong that player is on this module's content overall.

These combine, Elo/IRT-style, into a per-item, per-player **probability the
player knows this item** (`P(known)`). This is implemented in
`js/storage.js` (`getMasteryEstimate`, `getItemMasteryEstimate`,
`recordAnswer`), surfaces in the Debug Player panel (see below), and now
also drives card selection and the "known" milestone used for pacing and
progress chips — see Adaptive Pacing below.

**Setup, per item:**

- Convert `popularity` into a difficulty in logit space:
  `difficulty = (50 - popularity) / 10`. A very popular item (popularity
  100) has difficulty -5 (easy); an obscure item (popularity 0) has
  difficulty +5 (hard); a middling item (popularity 50) is neutral.

**Setup, per player + module:**

- `ability` starts at 0 the first time a player opens a module.
- Each item also tracks an `itemOffset`, starting at 0 — this is where
  direct evidence about *that specific item* accumulates, separate from the
  player's general ability.

**Estimating P(known) for any item, asked or not:**

```
P(known) = sigmoid(ability - difficulty + itemOffset)
```

Because this formula only needs `ability` and the item's `popularity`, it
gives every item in the module a reasonable estimate even before the player
has ever been asked about it — exactly the "less popular items are less
likely to be known until asked" behavior we want. Once an item has actually
been asked, its `itemOffset` lets the estimate diverge from what popularity
alone would predict.

**Updating after each answer:**

When a player answers item *i* (outcome = 1 if correct, 0 if incorrect):

1. Compute `predicted = P(known)` for that item *before* this update.
2. `error = outcome - predicted`
3. `ability += K_ability * error` (small step, e.g. `K_ability = 0.2` —
   nudges the overall sense of how strong the player is at this module).
4. `itemOffset += K_item * error` (bigger step, e.g. `K_item = 0.5` —
   direct evidence about one item should move that item's own estimate more
   than it moves the player's general ability).

**From P(known) to P(answer correctly):**

Each flashcard is multiple-choice (1 correct answer + 3 distractors), so a
player can answer correctly without knowing the item, just by guessing. The
probability of a correct answer is therefore higher than `P(known)`:

```
P(correct) = guessRate + (1 - guessRate) * P(known)
```

where `guessRate = 1 / numChoices` (1/4 with the current 4-choice cards).
This guess-adjusted figure feeds card-selection weighting (see Adaptive
Pacing) and the Debug Player panel, but isn't used to update `ability` or
`itemOffset` — that update still uses `P(known)` as the predicted value,
per the formula above.

**From P(known) to "mastered":**

Pacing and the module-select progress chip need a binary "does the player
know this item" signal, not just a continuous probability. An item counts
as **mastered** (`js/storage.js`, `isItemMastered`) once two things are
both true:

- the player has answered it at least once, and
- `P(known) >= MASTERY_KNOWN_THRESHOLD` (0.8).

The evidence requirement matters: popularity alone can push `P(known)`
above 0.8 for a very popular item (e.g. a continent with `popularity` 90)
even before the player has ever been asked about it. Without requiring at
least one answer, such an item would show as already "known" for a brand
new player, and the active pool could expand past the starter set before
any questions had been answered. Requiring evidence first keeps "mastered"
meaning "demonstrated," not just "popular."

## Debug Player

Any player named "debug" (case-insensitive, e.g. "Debug", "DEBUG ") sees an
extra panel on the Flashcard Screen, below the score tally, showing the
current card's mastery data: popularity, difficulty, ability, itemOffset,
`P(known)`, `P(correct)`, the player's last 5 answers for that item, and
whether the item currently counts as "mastered" for pacing (see Adaptive
Pacing). This exists to make the otherwise-invisible mastery model
inspectable while it's tuned. It's implemented in `js/flashcards.js`
(`isDebugPlayer`, `renderDebugPanel`).

## Adaptive Pacing

Every session uses the same pacing, Active Learning, driven by the
Elo/IRT mastery model above via `isItemMastered` and
`getItemMasteryEstimate` in `js/storage.js`.

The active pool starts with the top `ACTIVE_LEARNING_POOL_SIZE` (5)
*distinct topics* by `popularity` (or all topics, if the module has fewer
than 5 — relevant for the 5-topic Oceans module), one entry per topic —
see Recall Variants for why this dedupes by `name` first rather than
ranking raw entries: without it, a popular topic's own recall variants can
outrank a *different*, less popular topic's base entry, filling several
starter-pool slots with cuts of the same one or two topics instead of a
spread of different ones. Once every item in the pool but one is
mastered, the next-most-popular item not yet in the pool — topic or
variant — is added. This repeats until every item in the module is
active, so a topic's recall variants join the pool once there's room,
not necessarily gated behind that topic's own mastery specifically.

The next card is chosen at random from the active pool (minus whichever
card was just answered), weighted continuously by `1 - P(correct)` per
candidate (`js/flashcards.js`, `buildSelectionProbabilities`): items the
player is less likely to answer correctly get proportionally more
selection weight, with a small floor so no candidate — however well
mastered — ever has a zero chance of review.

## Distractor selection

For MVP, the 3 wrong choices are picked at random from the same module
(excluding the correct answer). Good enough for 5–7 item modules; smarter
"confusable neighbor" selection (e.g. similarly-shaped countries) is a
future idea once modules get bigger.

Recall variants share a `name` with their base item, so distractor
selection needs to exclude by `name`, not just `id` — otherwise a variant
and its base item (or two variants of the same item) could appear as two
buttons both labeled the same name. `pickDistractors` currently filters by
`id` only (`js/flashcards.js`); this needs updating once variants ship.

## Open questions / risks

- **Map accuracy:** resolved — map images turned out rough when
  AI-generated (image generators aren't reliable at precise cartography),
  so geography modules switched to rendering maps programmatically from
  real geographic datasets instead (see "Geography modules — generating
  map images" in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)), which
  sidesteps the accuracy problem entirely.
- **localStorage durability:** acceptable for MVP, but worth flagging that
  clearing browser data wipes all kids' progress, and progress won't follow
  a kid to a different device.
- **Module art direction:** the module-select screen needs some visual
  identity per module; not blocking for MVP but worth a pass before kids
  actually use it.
- **Mastery model tuning:** the model now drives pacing directly (see
  Adaptive Pacing), but the logit scaling factor, the `K_ability` /
  `K_item` step sizes, and `MASTERY_KNOWN_THRESHOLD` are still starting
  guesses — they'll likely need tuning once there's real play data to look
  at. The Debug Player panel exists to make this data visible in the
  meantime.
