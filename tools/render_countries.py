"""Render per-continent country module images and plan files from Natural
Earth data.

Writes images/<module-id>/<item-id>.png for every widely-recognized country,
plus data/<module-id>.plan.json (the Stage 1 plan file - see
IMPLEMENTATION_PLAN.md's "AI-assisted module creation workflow"). Stage 2
content (facts, alt text) still has to be authored separately and appended
to data/<module-id>.json by hand or by an AI agent.

See tools/README.md for how to fetch the input GeoJSON file and run this.
"""

import json
import re
import unicodedata
from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from shapely.affinity import translate
from shapely.ops import unary_union

REPO_ROOT = Path(__file__).resolve().parent.parent
GEO_DATA_DIR = Path(__file__).resolve().parent / "geo-data"
DATA_DIR = REPO_ROOT / "data"
IMAGES_BASE = REPO_ROOT / "images"

LAND_BASE = "#d8d3c4"
LAND_EDGE = "#9c9588"
HILITE_FILL = "#ff7a45"
HILITE_EDGE = "#c8501f"
BG = "#cfe8f3"

FIGSIZE = (8, 6)
DPI = 120
PAD_FRACTION = 0.9  # zoomed out ~50% from the original 0.45 for more continental context

CONTINENT_MODULES = {
    "Africa": ("africa-countries", "African Countries"),
    "Asia": ("asia-countries", "Asian Countries"),
    "Europe": ("europe-countries", "European Countries"),
    "North America": ("north-america-countries", "North American Countries"),
    "South America": ("south-america-countries", "South American Countries"),
    "Oceania": ("oceania-countries", "Oceania Countries"),
}

# Dependencies (not sovereign) and disputed/unrecognized territories, dropped
# per editorial decision to keep modules to widely-recognized countries only.
EXCLUDE_NAMES = {
    "Greenland",
    "Puerto Rico",
    "New Caledonia",
    "Falkland Is.",
    "Taiwan",
    "Kosovo",
    "Palestine",
    "N. Cyprus",
    "W. Sahara",
    "Somaliland",
}

# NAME is abbreviated or NAME_LONG is the better-known/kid-friendly form.
DISPLAY_NAME_OVERRIDES = {
    "Central African Rep.": "Central African Republic",
    "Congo": "Republic of the Congo",
    "Dem. Rep. Congo": "Democratic Republic of the Congo",
    "Eq. Guinea": "Equatorial Guinea",
    "S. Sudan": "South Sudan",
    "eSwatini": "Eswatini",
    "Bosnia and Herz.": "Bosnia and Herzegovina",
    "Dominican Rep.": "Dominican Republic",
    "United States of America": "United States",
    "Solomon Is.": "Solomon Islands",
}


def slugify(name):
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug


def display_name(raw_name):
    return DISPLAY_NAME_OVERRIDES.get(raw_name, raw_name)


def unwrap_antimeridian(geometry):
    """Shift any polygon part with a negative centroid longitude by +360,
    so countries straddling the antimeridian (Russia, Fiji) get a single
    contiguous bounding box instead of a naive 360-degree-wide one."""
    parts = list(geometry.geoms) if hasattr(geometry, "geoms") else [geometry]
    shifted_parts = [
        translate(part, xoff=360) if part.centroid.x < 0 else part
        for part in parts
    ]
    return unary_union(shifted_parts)


def render_country(ax, geometry, color, edge, linewidth, xlim):
    """Plot geometry three times (shifted -360/0/+360) so whichever copy
    falls inside xlim renders correctly regardless of antimeridian wraps."""
    for dx in (-360, 0, 360):
        shifted = translate(geometry, xoff=dx)
        if shifted.bounds[2] < xlim[0] or shifted.bounds[0] > xlim[1]:
            continue
        gpd.GeoSeries([shifted]).plot(ax=ax, color=color, edgecolor=edge, linewidth=linewidth)


def main():
    countries = gpd.read_file(GEO_DATA_DIR / "countries.geojson")
    countries = countries[
        countries["CONTINENT"].isin(CONTINENT_MODULES.keys())
        & ~countries["NAME"].isin(EXCLUDE_NAMES)
    ].copy()

    base_geoms = list(countries.geometry)

    for continent, (module_id, module_name) in CONTINENT_MODULES.items():
        sub = countries[countries["CONTINENT"] == continent].sort_values("NAME")
        plan = []
        out_dir = IMAGES_BASE / module_id
        out_dir.mkdir(parents=True, exist_ok=True)

        for _, row in sub.iterrows():
            name = display_name(row["NAME"])
            item_id = slugify(name)
            plan.append({"id": item_id, "name": name})

            geometry = row.geometry
            unwrapped = unwrap_antimeridian(geometry)
            minx, miny, maxx, maxy = unwrapped.bounds
            w = maxx - minx
            h = maxy - miny
            padx = max(w, 1.0) * PAD_FRACTION
            pady = max(h, 1.0) * PAD_FRACTION
            xlim = (minx - padx, maxx + padx)
            ylim = (miny - pady, maxy + pady)

            fig, ax = plt.subplots(figsize=FIGSIZE, dpi=DPI)
            ax.set_facecolor(BG)

            for base_geom in base_geoms:
                render_country(ax, base_geom, LAND_BASE, LAND_EDGE, 0.4, xlim)
            render_country(ax, geometry, HILITE_FILL, HILITE_EDGE, 1.2, xlim)

            ax.set_xlim(*xlim)
            ax.set_ylim(*ylim)
            ax.set_aspect("equal")
            ax.set_xticks([])
            ax.set_yticks([])
            for spine in ax.spines.values():
                spine.set_visible(False)
            plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

            out_path = out_dir / f"{item_id}.png"
            fig.savefig(out_path, facecolor=BG)
            plt.close(fig)

        plan_path = DATA_DIR / f"{module_id}.plan.json"
        with open(plan_path, "w") as f:
            json.dump(plan, f, indent=2)
            f.write("\n")
        print(f"{module_id}: {len(plan)} countries -> {plan_path}, images in {out_dir}")


if __name__ == "__main__":
    main()
