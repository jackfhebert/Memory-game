"""Render Continents and Oceans module images from Natural Earth data.

See tools/README.md for how to fetch the input GeoJSON files and run this.
"""

from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from shapely.geometry import box

REPO_ROOT = Path(__file__).resolve().parent.parent
GEO_DATA_DIR = Path(__file__).resolve().parent / "geo-data"
IMAGES_BASE = REPO_ROOT / "images"

OCEAN_BG = "#cfe8f3"
LAND_BASE = "#d8d3c4"
LAND_EDGE = "#9c9588"
HILITE_FILL = {
    "continent": "#ff7a45",
    "ocean": "#1f9e9e",
}
HILITE_EDGE = {
    "continent": "#c8501f",
    "ocean": "#0d6e6e",
}

FIGSIZE = (10, 5)  # 2:1, matches true equirectangular aspect
DPI = 120

CONTINENT_MAP = {
    "africa": "Africa",
    "antarctica": "Antarctica",
    "asia": "Asia",
    "australia": "Oceania",
    "europe": "Europe",
    "north-america": "North America",
    "south-america": "South America",
}

# Ocean name casing is inconsistent in the source dataset (a known
# ne_110m_geography_marine_polys quirk) - matched as-is below.
OCEAN_MAP = {
    "pacific": ["North Pacific Ocean", "South Pacific Ocean"],
    "atlantic": ["North Atlantic Ocean", "South Atlantic Ocean"],
    "indian": ["INDIAN OCEAN"],
    "arctic": ["Arctic Ocean"],
    "southern": ["SOUTHERN OCEAN"],
}


def render(countries, marine, item_id, kind, highlight_geom):
    fig, ax = plt.subplots(figsize=FIGSIZE, dpi=DPI)
    ax.set_facecolor(OCEAN_BG)

    if kind == "continent":
        countries.plot(ax=ax, color=LAND_BASE, edgecolor=LAND_EDGE, linewidth=0.3)
        gpd.GeoSeries([highlight_geom], crs=countries.crs).plot(
            ax=ax,
            color=HILITE_FILL[kind],
            edgecolor=HILITE_EDGE[kind],
            linewidth=1.2,
        )
    else:
        gpd.GeoSeries([highlight_geom], crs=marine.crs).plot(
            ax=ax,
            color=HILITE_FILL[kind],
            edgecolor=HILITE_EDGE[kind],
            linewidth=1.2,
        )
        countries.plot(ax=ax, color=LAND_BASE, edgecolor=LAND_EDGE, linewidth=0.3)

    ax.set_xlim(-180, 180)
    ax.set_ylim(-90, 90)
    ax.set_aspect("equal")
    ax.set_xticks([])
    ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_visible(False)
    plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

    out_dir = IMAGES_BASE / ("continents" if kind == "continent" else "oceans")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{item_id}.png"
    fig.savefig(out_path, facecolor=OCEAN_BG)
    plt.close(fig)
    print("wrote", out_path)


def main():
    countries = gpd.read_file(GEO_DATA_DIR / "countries.geojson")
    marine = gpd.read_file(GEO_DATA_DIR / "marine.geojson")

    for item_id, continent_name in CONTINENT_MAP.items():
        sub = countries[countries["CONTINENT"] == continent_name]
        geom = sub.geometry.union_all()
        if item_id == "europe":
            # Drop France's South American exclave (French Guiana), which
            # Natural Earth bundles into France's multipolygon.
            geom = geom.intersection(box(-180, 15, 180, 90))
        render(countries, marine, item_id, "continent", geom)

    for item_id, names in OCEAN_MAP.items():
        sub = marine[marine["name"].isin(names)]
        geom = sub.geometry.union_all()
        render(countries, marine, item_id, "ocean", geom)


if __name__ == "__main__":
    main()
