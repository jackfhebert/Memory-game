# Content-pipeline tools

Scripts that generate the images checked into `images/<module-id>/` when
building a new module. None of this is part of the shipped app — the app
only ever reads the image files these scripts produce, plus the
hand-authored facts in `data/*.json`. Two approaches exist so far,
depending on whether the module's items have a natural map representation:

- **Map-rendering** (below) — for geography modules, render a map with
  the item's borders highlighted.
- **Photo-sourcing** (below) — for everything else so far (Animals, Pasta
  Shapes), fetch a real photo per item from Wikipedia/Wikimedia Commons
  instead of generating art.

A future module without a map *or* a free-to-use real-world photo per
item (e.g. a fictional-character topic) would still need actual
AI-generated or hand-sourced art — that remains a content task with no
tooling here yet.

## Map-rendering tools

These scripts generate the map images for the geography modules
(Continents, Oceans, US States, and the six per-continent Country
modules) from public geographic datasets.

### Setup

```
pip install geopandas matplotlib shapely
```

### Get the input data

The scripts read from `tools/geo-data/`, which is gitignored (these are
large third-party datasets, not project source). Download:

- **Countries** — Natural Earth 1:110m admin-0-countries, as
  `tools/geo-data/countries.geojson`:
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
- **Oceans** — Natural Earth 1:110m geography-marine-polys, as
  `tools/geo-data/marine.geojson`:
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_geography_marine_polys.geojson
- **US States** — PublicaMundi's states GeoJSON, as
  `tools/geo-data/us-states.json`:
  https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json

### Run

From the `tools/` directory:

```
python3 render_continents_oceans.py   # images/continents/, images/oceans/
python3 render_states.py              # images/states/
python3 render_countries.py           # images/<continent>-countries/, data/<continent>-countries.plan.json
```

Each script writes PNGs directly into the matching `images/` folder
using the repo-relative paths in the script, so they can be run from a
fresh clone with no path edits. `render_countries.py` also writes a
`data/<module-id>.plan.json` per continent — that's Stage 1 of the
"AI-assisted module creation workflow" below; the `facts` and `alt`
text in `data/<module-id>.json` still have to be authored separately.

`render_countries.py` is slow (minutes, not seconds) — for every one of
~165 countries it redraws the whole base map underneath the
highlighted one, since the crop window differs per country.

### Shared rendering conventions

- **Palette**: land `#d8d3c4` fill / `#9c9588` edge, background (ocean)
  `#cfe8f3`, highlight `#ff7a45` fill / `#c8501f` edge for
  continents/states/countries, `#1f9e9e` fill / `#0d6e6e` edge for
  oceans.
- **Crop-to-bounds**: states and countries crop to the highlighted
  item's own bounding box plus padding (`PAD_FRACTION`, 0.35 for
  states, 0.45 for countries), so small and large items both fill the
  frame appropriately. Continents and oceans instead render the full
  fixed `-180..180 / -90..90` world, since they're large enough that a
  fixed frame already reads well.
- **Antimeridian**: Russia and Fiji straddle the 180°/-180° seam.
  `render_countries.py` unwraps each country's geometry (shifting parts
  with negative-longitude centroids by +360) before computing its crop
  box, then plots every country three times (shifted -360/0/+360),
  skipping copies that fall outside the crop window — whichever shifted
  copy lands in-frame renders correctly.
- **Country exclusions**: `EXCLUDE_NAMES` in `render_countries.py` drops
  non-sovereign dependencies and disputed/unrecognized territories
  (Greenland, Puerto Rico, New Caledonia, Falkland Islands, Taiwan,
  Kosovo, Palestine, Northern Cyprus, Western Sahara, Somaliland), per
  an editorial decision to keep the country modules to widely-recognized
  sovereign countries only — this is a kid-facing app, and that set of
  names is the least likely to need a footnote.
- **Display names**: `DISPLAY_NAME_OVERRIDES` in `render_countries.py`
  maps Natural Earth's abbreviated/idiosyncratic `NAME` values (e.g.
  `"Dem. Rep. Congo"`, `"eSwatini"`) to the names a kid would recognize.
- **IDs**: `slugify()` (NFKD-normalize, strip to ASCII, non-alphanumeric
  runs to hyphens) turns a display name into the item/file id, e.g.
  `"Côte d'Ivoire"` → `cote-d-ivoire`.

## Photo-sourcing tools

Used for modules whose items are real-world things best shown with an
actual photo rather than a map (so far: Animals, Pasta Shapes). Fetches
each item's lead image straight from Wikipedia/Wikimedia Commons, crops
it to the standard 960×720 card size, and saves it as a JPEG.

### Setup

```
pip install Pillow
```

### Run

From the repo root:

```
python3 tools/fetch_wiki_photos.py <module-id> <sources.json>
python3 tools/contact_sheet.py images/<module-id>/ /tmp/<module-id>_sheet.png
```

`sources.json` maps each item id to either a Wikipedia page title (its
lead/`originalimage` is used) or a direct image URL override:

```json
{
  "lion": "Lion",
  "fusilli": "https://upload.wikimedia.org/wikipedia/commons/a/aa/Fusilli_pasta.jpg"
}
```

Write this file as a scratch/plan file alongside the module's other draft
content (it doesn't need to be checked in once the module is published —
same as the `.plan.json` files above). Items whose output file already
exists are skipped on rerun (`--force` to redo), so a large module's
photos can be fetched across several sessions without re-downloading
everything.

`contact_sheet.py` lays out every image in a module into one labeled grid
PNG, so a whole module's photos can be visually scanned at once before
publishing — much faster than opening each file individually to catch a
bad crop or a photo that doesn't match its `alt` text.

### When the Wikipedia lead image isn't usable

For some items, the Wikipedia article's `originalimage` is missing
entirely, or shows the wrong thing for a kid-facing flashcard (a cooked
dish instead of the raw food shape, an unusual pose, the wrong color
morph). When that happens:

1. Try a different, more specific Wikipedia article title first (e.g.
   "American flamingo" instead of "Flamingo" got a vivid pink one-legged
   pose instead of two pale flamingos standing in water).
2. If that doesn't help, search Wikimedia Commons directly —
   `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=<query>&format=json`
   or browse a `Category:<Topic>` page — for an alternate freely-licensed
   photo, and put its direct file URL in `sources.json` as an override.
3. Download a few candidates, view them, and pick the clearest one
   before committing to a URL — `contact_sheet.py` or just opening the
   candidate files works for this.

### Crop conventions

- Target size matches the other modules' cards: 960×720 (4:3).
- Landscape sources wider than 4:3 are center-cropped horizontally.
- Portrait sources are cropped vertically anchored 1/4 of the way down
  from the top, not dead-center — subjects (an animal's head, a food's
  shape) are usually framed nearer the top of a portrait photo, and a
  center crop can cut off the part that matters (e.g. decapitating a
  giraffe).
- Saved as JPEG, quality 85 — real photos compress far better than the
  flat-color map PNGs above; this keeps a 30+ item module's images in the
  same size ballpark (~100-200KB each) as everything else in the repo,
  instead of multi-megabyte lossless PNGs.
