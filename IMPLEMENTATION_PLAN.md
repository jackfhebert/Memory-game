# Implementation Plan — Memory Game

See also: [README](README.md) · [Design Doc](DESIGN.md) ·
[Production Overview](PRODUCTION.md)

## Goal for this pass

Get a real, playable version of the [design doc](DESIGN.md) running end to
end: Player Select → Module Select → Mode Select → Flashcard loop, for the
Continents and Oceans modules, on a phone/tablet-sized screen.

Two pieces from [DESIGN.md](DESIGN.md) are deliberately simplified for
this first pass, to be filled in once the rest works:

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
    "id": "oceans",
    "name": "Oceans",
    "dataFile": "oceans.json",
    "color": "#2BB3A3",
    "icon": "🌊"
  },
  {
    "id": "continents",
    "name": "Continents",
    "dataFile": "continents.json",
    "color": "#4F86C6",
    "icon": "🌍"
  }
]
```

This is fetched at startup to populate Module Select. The `color`/`icon`
per entry drive the tile look without needing any per-module code, and
the array order is the tile order shown to the kid.

## Screens

### Player Select

- One large, rounded card-style button per saved player name (read from
  localStorage), in a responsive grid sized for touch.
- An "+ Add Player" tile opens an inline text input + confirm button to
  create a new name.
- Tapping a player moves to Module Select.

### Module Select

- Same tile visual language, one tile per entry in the module manifest,
  colored/iconed per its manifest entry, in the same order as the
  manifest array — there's no separate sort step, so reordering the
  modules a kid sees is just reordering `data/modules.json`.
- Each tile shows a small progress chip, e.g. "3 of 7" — the count of
  items the player has answered correctly at least once, out of the
  module's total item count. Simple and meaningful without needing the
  real mastery model.
- Tapping a module moves to Mode Select.

### Mode Select

- Two large buttons: "Active Learning" and "All Cards" (per
  [DESIGN.md](DESIGN.md)).
- Tapping either starts the Flashcard loop for that module + mode.

### Flashcard Screen

- Large picture, fact text, and a 2×2 grid of 4 answer buttons sized for
  thumbs.
- An "X" in a corner, always tappable, returns to Module Select.
- Tapping an answer flips the card: the correct name is highlighted, and
  the tapped choice is marked right or wrong.
- A "Next" button advances to another card from the active pool.
- Below the answer grid, a running tally shows two labeled, colored
  chips for the session — "⭐ N Correct" and "🔁 N Try Again" — instead
  of bare ✓/✗ symbols, which kids found hard to read at a glance.
- Each time a card is shown, up to 3 other images from the active pool are
  preloaded (an off-DOM `<img>` per target) so the next card's picture is
  likely already cached by the time it's drawn — masking image load time
  rather than eliminating it, since the next card is picked at random
  from the pool rather than a known fixed sequence.
- `.flashcard-image` reserves a 4:3 `aspect-ratio` box before its image
  loads (every module's images are saved at that ratio — see
  [`tools/README.md`](tools/README.md)), so the fact text and answer
  grid below it don't jump down once the picture finishes loading.

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
selection logic yet, but it's exactly the history the Elo/IRT mastery
model in [DESIGN.md](DESIGN.md) will need to bootstrap from, and it's what
the Module Select progress chip reads from.

## Card selection logic (v1, simplified)

- **Active Learning** — at the start of a session, the active pool is the
  5 most popular items in the module by `popularity` (or all items, if the
  module has fewer than 5). Whenever a player answers an item correctly
  twice, the single most-popular item not yet in the pool is added —
  borrowing the "introduce by popularity" shape of the full mastery model
  from [DESIGN.md](DESIGN.md) without its P(known)-based trigger, which is
  still deferred.
- **All Cards** — the active pool is every item in the module, immediately.
- In both modes, the next card is drawn uniformly at random from the
  active pool, avoiding an immediate repeat of the same card when the pool
  has more than one item.
- This logic is the part that gets replaced wholesale once the mastery
  model is implemented — everything else (screens, data model, distractor
  selection) stays the same.

## Distractor selection

3 wrong choices are picked at random from the rest of the module's items
(excluding the correct one), per [DESIGN.md](DESIGN.md). This requires
each module to have at least 4 items — see the module-size note below.

## Adding a new module

1. Create `data/<module-id>.json` with an item list matching the
   [DESIGN.md](DESIGN.md) schema (`id`, `name`, `image`, `alt`, `fact`,
   `popularity`). Needs at least 4 items, since each card needs 3
   distractors.
2. Create an `images/<module-id>/` directory with one image per item,
   matching the paths referenced in the JSON.
3. Add an entry for it to `data/modules.json` (`id`, `name`, `dataFile`,
   `color`, `icon`).
4. No code changes required — Player Select, Module Select, Mode Select,
   and the Flashcard screen are all generic over the manifest and item
   schema.
5. Reload the app; the new module's tile appears on Module Select
   automatically.

## AI-assisted module creation workflow

The steps above are the mechanical contract. For modules beyond the
hand-authored Continents/Oceans, the expected path is that the user names
a topic and a target count (e.g. "Pokémon, 100 items," or "all" for a
naturally bounded set like U.S. states), and an AI agent (e.g. Claude
Code) does the rest. A large module — 50-100+ items, each needing a
generated image — can take a while and may span multiple work sessions, so
the process is split into stages that checkpoint as they go. That way work
can stop and resume at any point without losing finished items or redoing
item selection.

### Stage 1 — Plan the item list

- Pick a module id (a slug of the topic name, e.g. `pokemon`).
- Decide the exact list of items to include. For a naturally bounded topic
  ("all U.S. states") this is just the full list. For a large topic with a
  requested count ("100 Pokémon"), select the N most popular/recognizable
  items — the same notion of fame the `popularity` field already
  captures, so selection criteria and the field are really the same idea.
- Write this list to a scratch file, `data/<module-id>.plan.json` — an
  array of `{ "id", "name" }` for every item in scope, nothing else yet.
  This file is the durable record of *what was decided*, so resuming later
  never re-runs item selection or risks landing on a different set of N
  items.

### Stage 2 — Fill in content, in batches

For a small batch of items at a time (e.g. 5-10), for each one not yet
present in `data/<module-id>.json`:

1. Write its `name`, a short kid-friendly `fact`, and a `popularity`
   estimate (0-100). Facts should be checked against a reliable source
   rather than generated from memory alone, since they're presented to a
   kid as true. Neither the `fact` nor the `alt` text should name the
   item — both need to describe it without giving away the answer.
2. Generate its image, then resize it to the module's standard dimensions
   (the same size used by other modules) and save it to
   `images/<module-id>/<item-id>.png`. Resizing is a one-off
   content-pipeline step (e.g. an ImageMagick/`sips` command), not
   something the shipped app needs to do at runtime. Write its `alt` text
   describing what the image shows.
3. Append the finished item to `data/<module-id>.json`.

Commit after each batch. `data/<module-id>.json` is itself the progress
marker — items already in it are done, and the remainder of
`data/<module-id>.plan.json` is what's left. Critically, the module is
**not yet** referenced from `data/modules.json`, so a partially-built
module never shows up as a playable (and broken) tile in the running app
while work is still in progress.

### Stage 3 — Publish the module

Once every item in the plan file has a matching entry in
`data/<module-id>.json`, add the module's entry to `data/modules.json`
(`id`, `name`, `dataFile`, `color`, `icon`) — this is the single step that
makes the module appear on Module Select. The plan file can be deleted at
that point, or left as a record of what was selected and why.

This mirrors the order in "Adding a new module" above: content and images
are authored and checked in first, and the manifest is only touched last,
once the module is actually complete.

## Geography modules — generating map images

Continents, Oceans, US States, and the six per-continent Country modules
(`africa-countries`, `asia-countries`, `europe-countries`,
`north-america-countries`, `oceania-countries`,
`south-america-countries`) all use the same approach for images: render a
world or US map with the item's borders highlighted, using
[geopandas](https://geopandas.org/), matplotlib (headless `Agg` backend),
and [shapely](https://shapely.readthedocs.io/), rather than generated
art. This makes the image step Stage 1 + part of Stage 2 of the workflow
above: it produces the plan file and every item's image in one
automated pass, leaving only facts and alt text to author by hand.

The scripts live in [`tools/`](tools/), with full setup, data-source
URLs, and rendering conventions (palette, crop-to-bounds padding,
antimeridian handling for Russia/Fiji, the country exclusion list, and
display-name overrides) documented in [`tools/README.md`](tools/README.md).
In short: `tools/render_continents_oceans.py`, `tools/render_states.py`,
and `tools/render_countries.py` each read a public GeoJSON dataset
(Natural Earth for continents/oceans/countries, PublicaMundi for US
states) and write straight into the matching `images/` folder using
repo-relative paths, so a fresh clone can regenerate every map image
with no path edits — only the dataset files themselves need to be
downloaded first, since they're large third-party data and not checked
into the repo.

This only covers the geographic/visual half of building one of these
modules. The factual content — `facts` and non-naming `alt` text in
`data/<module-id>.json` — still has to be authored separately, by hand
or by an AI agent, with facts checked against a reliable source per
Stage 2 above.

## Photo-sourced modules — real photos instead of generated art

Animals and Pasta Shapes don't have a map representation, but they are
real-world things with freely-licensed photos already available, so
neither needed AI-generated art either: each item's image is a real
photo fetched from Wikipedia/Wikimedia Commons, cropped to the same
960×720 card size as the geography modules.

`tools/fetch_wiki_photos.py` does the fetch+crop+save in one pass per
module, given a `sources.json` mapping item id → Wikipedia page title (or
a direct image URL override for the handful of items whose Wikipedia
lead image is missing or unsuitable — e.g. a cooked-dish photo instead of
the raw pasta shape). `tools/contact_sheet.py` lays out a module's
images into one grid for a quick visual pass before publishing. Full
usage and the override workflow are documented in
[`tools/README.md`](tools/README.md).

Like the geography pipeline, this only covers the image half — `facts`
and non-naming `alt` text in `data/<module-id>.json` still have to be
authored separately and checked against a reliable source.

## What's deliberately deferred

- The Elo/IRT mastery model and adaptive pool expansion from
  [DESIGN.md](DESIGN.md) — v1 uses random selection instead, but already
  records the per-item shown/correct counts that model will need.
- AI-generated images — not needed yet. Geography modules use rendered
  map data, and Animals/Pasta Shapes use real sourced photos (see above);
  a future topic with neither a map nor a real-world photo per item
  (e.g. a fictional-character topic) would still need actual AI-generated
  or hand-sourced art, which remains a content task, not a code change.
- Audio pronunciation, a dedicated map mode, and additional modules beyond
  Continents/Oceans — already deferred in [DESIGN.md](DESIGN.md).

## Open questions

- Exact visual style (palette, fonts, animation details) for the "pretty
  and modern" look isn't nailed down here — proposing a first pass in code
  and iterating from there seems faster than specifying it in writing.
- Which specific AI image-generation tool/API to call for a future
  non-geography module, and the exact standard image dimensions for
  cards, aren't pinned down — to be decided when that module actually
  gets built.
