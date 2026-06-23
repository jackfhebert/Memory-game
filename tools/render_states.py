"""Render the US States module images from the PublicaMundi states GeoJSON.

See tools/README.md for how to fetch the input GeoJSON file and run this.
"""

from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

REPO_ROOT = Path(__file__).resolve().parent.parent
GEO_DATA_DIR = Path(__file__).resolve().parent / "geo-data"
OUT_DIR = REPO_ROOT / "images" / "states"

LAND_BASE = "#d8d3c4"
LAND_EDGE = "#9c9588"
HILITE_FILL = "#ff7a45"
HILITE_EDGE = "#c8501f"
BG = "#cfe8f3"

FIGSIZE = (8, 6)
DPI = 120
PAD_FRACTION = 0.35  # extra context around the highlighted state's own bounds


def slug(name):
    return name.lower().replace(" ", "-")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    states = gpd.read_file(GEO_DATA_DIR / "us-states.json")
    states = states[~states["name"].isin(["District of Columbia", "Puerto Rico"])]

    for _, row in states.iterrows():
        name = row["name"]
        item_id = slug(name)
        geom = row.geometry

        fig, ax = plt.subplots(figsize=FIGSIZE, dpi=DPI)
        ax.set_facecolor(BG)

        states.plot(ax=ax, color=LAND_BASE, edgecolor=LAND_EDGE, linewidth=0.4)
        gpd.GeoSeries([geom], crs=states.crs).plot(
            ax=ax, color=HILITE_FILL, edgecolor=HILITE_EDGE, linewidth=1.2
        )

        minx, miny, maxx, maxy = geom.bounds
        w = maxx - minx
        h = maxy - miny
        padx = max(w, 0.5) * PAD_FRACTION
        pady = max(h, 0.5) * PAD_FRACTION
        ax.set_xlim(minx - padx, maxx + padx)
        ax.set_ylim(miny - pady, maxy + pady)
        ax.set_aspect("equal")
        ax.set_xticks([])
        ax.set_yticks([])
        for spine in ax.spines.values():
            spine.set_visible(False)
        plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

        out_path = OUT_DIR / f"{item_id}.png"
        fig.savefig(out_path, facecolor=BG)
        plt.close(fig)
        print("wrote", out_path)


if __name__ == "__main__":
    main()
