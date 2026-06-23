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

## Files and what goes in each

### `index.html`

- The single page the app ever loads. Holds the `<head>` (viewport meta
  tag, link to `css/styles.css`) and a `<body>` with one empty container
  div per screen (`#screen-player-select`, `#screen-module-select`,
  `#screen-mode-select`, `#screen-flashcard`), all empty until JS fills
  them in.
- One `<script type="module" src="js/app.js">` at the bottom — the only
  script tag in the file. Everything else is imported by `app.js`.
- No inline markup for tiles/buttons/cards — those are all built in JS so
  the screens can be generic over manifest/item data.

### `css/styles.css`

- Color/spacing variables (CSS custom properties) for the "modern" look —
  one place to retheme later.
- Shared tile/button styles (the big rounded touch-friendly buttons used
  on Player Select, Module Select, and Mode Select).
- Flashcard-specific styles: image sizing, the 2×2 answer grid, the
  flip/reveal transition, correct/incorrect color feedback, the "X" exit
  button.
- Responsive rules (flexbox/grid breakpoints) so layout holds up on both
  phone and tablet, portrait and landscape.
- A `.screen` / `.screen.active` convention for showing only the current
  screen's container — `app.js` toggles this class, CSS just defines what
  it means.

### `js/storage.js`

- The only file that touches `localStorage` directly.
- Player list: `getPlayers()`, `addPlayer(name)`.
- Per-player, per-module progress: `getProgress(player, moduleId)`,
  `recordAnswer(player, moduleId, itemId, wasCorrect)` — reads/writes the
  `itemStats` shape described below.
- Pure data access, no DOM code — every other file calls into this rather
  than touching `localStorage` itself.

### `js/modules.js`

- Fetches and caches `data/modules.json` (the manifest) and, per module,
  the corresponding `data/<module-id>.json` item list.
- `getModuleList()`, `getModuleItems(moduleId)`.
- Renders the Module Select screen: one tile per manifest entry, with its
  color/icon and a progress chip computed from `storage.js` data.
- Renders the Mode Select screen (the two "Active Learning" / "All Cards"
  buttons) once a module tile is tapped — small enough not to need its own
  file.

### `js/players.js`

- Renders the Player Select screen: one tile per name from
  `storage.getPlayers()`, plus the "+ Add Player" tile and its inline
  text-input flow.
- Tracks which player is currently selected and hands that off to
  `app.js` when a tile is tapped.

### `js/flashcards.js`

- Given a module's items + the chosen mode, builds the active pool
  (5 random items for Active Learning, all items for All Cards).
- Picks the next card from the pool (uniform random, no immediate
  repeats), and picks its 3 distractors at random from the rest of the
  module.
- Renders the Flashcard screen: image, fact, the 4 answer buttons, the
  flip/reveal on answer, and the "Next" / "X" buttons.
- Calls `storage.recordAnswer(...)` whenever the kid answers, regardless
  of mode.

### `js/app.js`

- The entry point loaded by `index.html`.
- Holds the one piece of shared app state (current player, module, mode)
  and a `showScreen(name)` function that toggles the `.active` class
  between the four screen containers.
- Wires the screens together: Player Select's "tile tapped" callback sets
  the player and calls into `modules.js` to render Module Select; Module
  Select's tap renders Mode Select; Mode Select's tap calls into
  `flashcards.js` to start the loop; the flashcard screen's "X" calls back
  into `modules.js` to re-render Module Select.
- Has no rendering logic of its own beyond this routing — every screen's
  actual markup is built by the file that owns it.

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
