# Implementation Plan — Memory Game

## Goal for this pass

Get a real, playable version of the design doc running end to end: Player
Select → Module Select → Mode Select → Flashcard loop, for the Continents
and Oceans modules, on a phone/tablet-sized screen.

Two pieces from DESIGN.md are deliberately simplified for this first pass,
to be filled in once the rest works:

- **Active Learning mode** just samples 5 random cards as its pool, instead
  of the Elo/IRT-style adaptive pacing model.
- **Card selection within a pool** is uniform random for now, instead of
  weighted toward lower `P(known)` — there's no mastery model yet to weight
  with.

The app already records the raw per-item stats the real mastery model will
need (see Data Model below), so swapping in the smarts later shouldn't
require reworking the screens.

## Tech stack

- Plain HTML, CSS, and vanilla JS (ES modules). No backend, no build step,
  no framework or dependencies. This keeps "standalone web app" literal —
  open `index.html`, or serve the folder with any static file server, and
  it runs.
- Mobile/tablet-first: a viewport meta tag, layout via flexbox/grid, and
  touch-sized tap targets throughout. Designed portrait-first but should
  hold up in landscape too.

## Directory structure

```
memory-game/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js          # screen routing / app state
│   ├── players.js       # player list, create/select (localStorage)
│   ├── modules.js        # load manifest + per-module JSON
│   ├── flashcards.js     # card pool + selection logic
│   └── storage.js        # localStorage read/write helpers
├── data/
│   ├── modules.json       # manifest of available modules
│   ├── continents.json
│   └── oceans.json
├── images/
│   ├── continents/
│   │   ├── africa.png
│   │   └── ...
│   └── oceans/
│       ├── pacific.png
│       └── ...
├── README.md
├── DESIGN.md
└── IMPLEMENTATION_PLAN.md
```

## Module manifest (`data/modules.json`)

```json
[
  {
    "id": "continents",
    "name": "Continents",
    "dataFile": "continents.json",
    "color": "#4F86C6",
    "icon": "🌍"
  },
  {
    "id": "oceans",
    "name": "Oceans",
    "dataFile": "oceans.json",
    "color": "#2BB3A3",
    "icon": "🌊"
  }
]
```

This is fetched at startup to populate Module Select. The `color`/`icon`
per entry drive the tile look without needing any per-module code.

## Screens

### Player Select

- One large, rounded card-style button per saved player name (read from
  localStorage), in a responsive grid sized for touch.
- An "+ Add Player" tile opens an inline text input + confirm button to
  create a new name.
- Tapping a player moves to Module Select.

### Module Select

- Same tile visual language, one tile per entry in the module manifest,
  colored/iconed per its manifest entry.
- Each tile shows a small progress chip, e.g. "3 of 7" — the count of
  items the player has answered correctly at least once, out of the
  module's total item count. Simple and meaningful without needing the
  real mastery model.
- Tapping a module moves to Mode Select.

### Mode Select

- Two large buttons: "Active Learning" and "All Cards" (per DESIGN.md).
- Tapping either starts the Flashcard loop for that module + mode.

### Flashcard Screen

- Large picture, fact text, and a 2×2 grid of 4 answer buttons sized for
  thumbs.
- An "X" in a corner, always tappable, returns to Module Select.
- Tapping an answer flips the card: the correct name is highlighted, and
  the tapped choice is marked right or wrong.
- A "Next" button advances to another card from the active pool.

## Data model — player progress (localStorage)

One entry per player + module, e.g. key
`memorygame:progress:<playerName>:<moduleId>`:

```json
{
  "itemStats": {
    "africa": { "shown": 4, "correct": 3 }
  }
}
```

This is written on every answer regardless of mode. It's not used for
selection logic yet, but it's exactly the history the Elo/IRT mastery model
in DESIGN.md will need to bootstrap from, and it's what the Module Select
progress chip reads from.

## Card selection logic (v1, simplified)

- **Active Learning** — at the start of a session, randomly sample 5 items
  from the module (or all items, if the module has fewer than 5) to form
  the active pool.
- **All Cards** — the active pool is every item in the module, immediately.
- In both modes, the next card is drawn uniformly at random from the
  active pool, avoiding an immediate repeat of the same card when the pool
  has more than one item.
- This logic is the part that gets replaced wholesale once the mastery
  model is implemented — everything else (screens, data model, distractor
  selection) stays the same.

## Distractor selection

3 wrong choices are picked at random from the rest of the module's items
(excluding the correct one), per DESIGN.md. This requires each module to
have at least 4 items — see the module-size note below.

## Adding a new module

1. Create `data/<module-id>.json` with an item list matching the DESIGN.md
   schema (`id`, `name`, `image`, `fact`, `popularity`). Needs at least 4
   items, since each card needs 3 distractors.
2. Create an `images/<module-id>/` directory with one image per item,
   matching the paths referenced in the JSON.
3. Add an entry for it to `data/modules.json` (`id`, `name`, `dataFile`,
   `color`, `icon`).
4. No code changes required — Player Select, Module Select, Mode Select,
   and the Flashcard screen are all generic over the manifest and item
   schema.
5. Reload the app; the new module's tile appears on Module Select
   automatically.

## What's deliberately deferred

- The Elo/IRT mastery model and adaptive pool expansion from DESIGN.md —
  v1 uses random selection instead, but already records the per-item
  shown/correct counts that model will need.
- AI-generated images — v1 ships with placeholder images so the loop can
  be built and tested; swapping in AI-generated art is a content task, not
  a code change.
- Audio pronunciation, a dedicated map mode, and additional modules beyond
  Continents/Oceans — already deferred in DESIGN.md.

## Open questions

- Exact visual style (palette, fonts, animation details) for the "pretty
  and modern" look isn't nailed down here — proposing a first pass in code
  and iterating from there seems faster than specifying it in writing.
