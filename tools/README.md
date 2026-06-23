# Map-rendering tools

These scripts generate the map images for the geography modules
(Continents, Oceans, US States, and the six per-continent Country
modules) from public geographic datasets. They're content-pipeline
tools, not part of the shipped app — the app only ever reads the PNGs
they produce, plus the hand-authored facts in `data/*.json`.

## Setup

```
pip install geopandas matplotlib shapely
```

## Get the input data

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

## Run

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

## Shared rendering conventions

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
