# Design Doc — Memory Game

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
  "fact": "Africa is home to the Sahara, the largest hot desert in the world.",
  "popularity": 90
}
```

- `image` — for geography modules, this is a world map with the item
  highlighted (e.g. Africa's outline highlighted on a world map), not a
  generic photo. This is how "find it on a map" sneaks into the MVP without
  being a separate game mode. Images are AI-generated rather than sourced
  from an existing library, keeping the whole content pipeline (facts,
  popularity estimates, and images) self-contained and easy to regenerate
  or extend to new modules.
- `fact` — a short, kid-friendly sentence.
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
5. This repeats indefinitely, cycling through the active pool. An "X" is
   always visible during Flashcard Mode so the kid can exit back to Module
   Select whenever they're done — there's no separate "finished" state to
   design for.

## Mastery Model

Two distinct ideas feed into how the game decides what a player knows:

- **Popularity** (`popularity`, 0–100) — authored per item, shared by all
  players. A prior belief about how likely *anyone* is to already know this
  item, before they've ever been asked about it.
- **Ability** (per player, per module) — a single running estimate of how
  strong that player is on this module's content overall.

These combine, Elo/IRT-style, into a per-item, per-player **probability the
player knows this item**, which is what actually drives pacing and review
frequency.

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

An item counts as "known" for pacing purposes once `P(known) >= 0.8`. This
threshold is internal — it's never shown to the kid as a score or grade.

## Adaptive Pacing

How the active pool behaves depends on the mode chosen in Mode Select:

- **All Cards** — every item in the module is in the active pool from the
  start.
- **Active Learning** — the active pool starts with the top 4 items by
  `popularity` (or all items, if the module has fewer than 4 — relevant for
  the 5-item Oceans module). Whenever the *average* `P(known)` across the
  active pool reaches 0.8, the next-most-popular item not yet in the pool
  is added. This repeats until every item in the module is active.

In both modes, the next card to show is chosen at random from the active
pool, weighted toward lower `P(known)` — so unmastered items come up more
often, but everything still gets reviewed occasionally.

## Distractor selection

For MVP, the 3 wrong choices are picked at random from the same module
(excluding the correct answer). Good enough for 5–7 item modules; smarter
"confusable neighbor" selection (e.g. similarly-shaped countries) is a
future idea once modules get bigger.

## Open questions / risks

- **AI-generated map accuracy:** image generators aren't reliable at
  precise cartography (exact borders/coastlines), so AI-generated
  highlighted maps may come out geographically rough. Fine for a personal
  MVP; worth a manual look once images are generated, and worth revisiting
  (e.g. generating a stylized background and overlaying a precise highlight
  programmatically) if accuracy turns out to matter more later.
- **localStorage durability:** acceptable for MVP, but worth flagging that
  clearing browser data wipes all kids' progress, and progress won't follow
  a kid to a different device.
- **Module art direction:** the module-select screen needs some visual
  identity per module; not blocking for MVP but worth a pass before kids
  actually use it.
- **Mastery model tuning:** the logit scaling factor and the `K_ability` /
  `K_item` step sizes above are starting guesses — they'll likely need
  tuning once there's real play data to look at.
