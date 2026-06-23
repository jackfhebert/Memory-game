# Design Doc — Memory Game

## Vision

This started from watching the World Cup with my kids and realizing they didn't know the countries playing. The goal of this app is to teach kids simple, fun facts about the world — starting with geography basics (continents, oceans, U.S. states) and later branching into lighter topics (sushi, pasta, etc.).

The eventual hope, per item, is that a kid can: pronounce its name, point to it on a map, and tell you a fun fact about it. The MVP focuses on the first step of that — recognizing the name and learning a fact — with pronunciation and map-pointing as later additions.

This is a home learning toy, not a product. No accounts, no passwords, no real security — just enough player separation that siblings don't mix up progress.

## MVP Scope

- **One device, browser-based, no backend.** A static HTML/CSS/JS app, run locally or hosted as static files. No server, no database.
- **Content lives in JSON files**, one per module, checked into the repo alongside images.
- **Player progress lives in browser localStorage** — it doesn't follow a kid between devices, and is lost if browser data is cleared. Acceptable for an MVP on one shared family device.
- **First module(s): Continents and Oceans.** Small, fixed sets (7 continents, 5 oceans) — enough to prove out the core loop before adding bigger content sets like U.S. states or World Cup countries.

### Explicitly out of scope for MVP

- Audio pronunciation playback (speaker button reading the name aloud).
- A dedicated "find it on a map" interactive mode, separate from using a map image as the card's picture.
- Modules beyond Continents and Oceans (U.S. States, World Cup countries, sushi, pasta, etc.).
- Cross-device synced progress / any backend or accounts.
- Anything beyond a simple per-item mastery score (no spaced repetition, no decay over time, no "smart" distractor selection).

These are captured here so they aren't lost, and so future modules/features have an obvious place to slot in later.

## Players

- On launch, the kid picks their name from a list of existing players (read from localStorage) or types a new name to create one.
- No password, no PIN, no profile pictures for MVP — just a name.
- All progress is stored under that name in localStorage, so each kid's mastery scores stay separate.

## Modules

A **module** is one topic's full content set (e.g. "Continents"). Each module is a JSON file listing its items.

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

- `image` — for geography modules, this is a world map with the item highlighted (e.g. Africa's outline highlighted on a world map), not a generic photo. This is how "find it on a map" sneaks into the MVP without being a separate game mode.
- `fact` — a short, kid-friendly sentence.
- `popularity` — a 0–100 prior estimate of how well-known the item is to most people. This is authored once per item (not per player) and only affects the *order* items are introduced in, not whether a player has learned it.

Content for Continents and Oceans will be drafted as placeholder JSON (facts + popularity estimates) using free/public-domain map images, so the app is playable end-to-end before real content review.

## Game Flow

1. **Player Select** — pick an existing name or create a new one.
2. **Module Select** — pick a module (Continents, Oceans), shown with a rough progress indicator (e.g. "3 of 7 known").
3. **Flashcard Mode** (the core loop):
   1. The app picks the next item from the player's *active pool* for that module (see Adaptive Pacing).
   2. **Card front:** picture + fun fact shown together, plus 4 multiple-choice name buttons (1 correct, 3 distractors from the same module, random order). Showing the fact before the guess means it doubles as a hint — intentional, since the goal is learning, not testing.
   3. The kid taps a choice.
   4. **Card flips** to reveal the correct name (highlighted) and whether their tap was right or wrong.
   5. Kid taps "Next" to continue.
4. This repeats indefinitely, cycling through the active pool, until the kid switches modules or stops.

There's no explicit "finished" state for MVP — once every item in a module is mastered, the loop just keeps reviewing everything. A celebratory "you know them all!" moment is a nice future touch, not required now.

## Adaptive Pacing — "start small, expand as they learn"

Two separate numbers per item:

| Number | Scope | Set by | Purpose |
|---|---|---|---|
| `popularity` | per item, shared by all players | authored in content JSON | decides introduction order only |
| mastery score | per item, per player | computed from gameplay | decides what's "known" and how often it's shown |

**Mastery score** (per player, per item):
- Starts at 0.
- Correct guess: `score += 20`.
- Incorrect guess: `score -= 10`.
- Clamped to 0–100.
- An item counts as "known" once `score >= 70`. This is used only internally for pacing — it's not shown to the kid as a number/grade.

**Active pool mechanics:**
- A player starts with the top 4 items by `popularity` in their active pool (or all items, if the module has fewer than 4 — relevant for the 5-item Oceans module).
- Within the active pool, the next card to show is chosen at random, weighted toward lower mastery scores — so unmastered items come up more often, but everything still gets reviewed occasionally.
- **Expansion rule:** whenever the *average* mastery score across the active pool reaches 70, the next-most-popular item not yet in the pool is added.
- This repeats until every item in the module is in the active pool, at which point the loop just keeps cycling forever, weighted by mastery score.

## Distractor selection

For MVP, the 3 wrong choices are picked at random from the same module (excluding the correct answer). Good enough for 5–7 item modules; smarter "confusable neighbor" selection (e.g. similarly-shaped countries) is a future idea once modules get bigger.

## Open questions / risks

- **Image sourcing for real use:** placeholder maps are fine to prove out the mechanic, but production-quality, kid-friendly, attribution-free highlighted maps need real sourcing before this goes beyond a toy.
- **localStorage durability:** acceptable for MVP, but worth flagging that clearing browser data wipes all kids' progress, and progress won't follow a kid to a different device.
- **Module art direction:** the module-select screen needs some visual identity per module; not blocking for MVP but worth a pass before kids actually use it.
