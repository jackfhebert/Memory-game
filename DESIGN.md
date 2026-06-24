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

## Game Flow

1. **Player Select** — pick an existing name or create a new one.
2. **Module Select** — pick a module (Continents, Oceans), shown with a
   rough progress indicator (e.g. "3 of 7 known").
3. **Mode Select** — for the chosen module, pick:
   - **Active Learning** — items are introduced gradually as the player
     demonstrates mastery (see Adaptive Pacing below).
   - **All Cards** — every item in the module is available immediately, no
     gradual introduction. Still uses the mastery model to weight which
     card comes up next, just without restricting the pool.
4. **Flashcard Mode** (the core loop):
   1. The app picks the next item from the player's active pool for that
      module and mode (see Adaptive Pacing).
   2. **Card front:** picture + fun fact shown together, plus 4
      multiple-choice name buttons (1 correct, 3 distractors from the same
      module, random order). Showing the fact before the guess means it
      doubles as a hint — intentional, since the goal is learning, not
      testing.
   3. The kid taps a choice.
   4. **Card flips** to reveal the correct name (highlighted) and whether
      their tap was right or wrong.
   5. Kid taps "Next" to continue.
   6. A running tally stays visible during the session: two labeled,
      colored chips — "⭐ N Correct" and "🔁 N Try Again" — update after
      each answer, giving the kid an at-a-glance sense of how the session's
      going without it feeling like a test score.
5. This repeats indefinitely, cycling through the active pool. An "X" is
   always visible during Flashcard Mode so the kid can exit back to Module
   Select whenever they're done — there's no separate "finished" state to
   design for.

## Mastery Model

Two distinct ideas feed into how the game decides what a player knows:

- **Popularity** (`popularity`, 0–100) — authored per item, shared by all
  players. Used to order which items get introduced first, both for the
  Active Learning starting pool and for the order items are added as it
  expands.
- **Recent-answer history** (per player, per item) — a capped list of that
  player's last 5 answers for the item (`true`/`false`, most recent last).

Recent behavior is a better predictor of how a kid will do next time than
an all-time correct/incorrect count — a kid who got an item right several
times last month but has missed it twice in a row recently needs more
practice now, not credit for an old streak. So rather than accumulating
lifetime totals, the game only looks at this short rolling window.

**Estimating whether an item is known:**

An item counts as "known" once at least 80% of its recent-answer history
(up to the last 5 answers) was correct. With only one answer on record, a
single correct answer is enough to count as known — there's no minimum
sample size beyond "has been asked at least once." An item with no answer
history yet (never asked) is not counted as known.

This threshold is internal — it's never shown to the kid as a score or
grade. It drives the "X of Y known" count on the Module Select tile and the
Active Learning pool-expansion trigger below.

## Adaptive Pacing

How the active pool behaves depends on the mode chosen in Mode Select:

- **All Cards** — every item in the module is in the active pool from the
  start, shown in `popularity` order on the first pass through the module,
  then in random order (never immediately repeating the previous card)
  after that.
- **Active Learning** — the active pool starts with the top few items by
  `popularity` (or all items, if the module has fewer). Whenever an item in
  the pool newly crosses the "known" threshold above — i.e. it wasn't known
  before this answer but is now — the next-most-popular item not yet in the
  pool is added. This repeats until every item in the module is active.

In both modes, the next card is chosen at random from the active pool
(never immediately repeating the previous card). There's no weighting
toward less-known items yet — that's a future idea once there's more play
data to justify the added complexity.

## Distractor selection

For MVP, the 3 wrong choices are picked at random from the same module
(excluding the correct answer). Good enough for 5–7 item modules; smarter
"confusable neighbor" selection (e.g. similarly-shaped countries) is a
future idea once modules get bigger.

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
- **Mastery model tuning:** the recent-answer window size (5) and the
  "known" threshold (80%) above are starting guesses — they'll likely need
  tuning once there's real play data to look at.
