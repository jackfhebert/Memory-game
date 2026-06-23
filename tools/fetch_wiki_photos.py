#!/usr/bin/env python3
"""Fetch one real photo per item from Wikipedia/Wikimedia Commons, crop it
to a fixed aspect ratio, and save it into images/<module-id>/.

Used for photo-sourced modules (Animals, Pasta Shapes) where there's no
map to render — see render_*.py and tools/README.md for that approach
instead. Full workflow, including how to pick a manual override URL when
a Wikipedia article's lead image is missing or unsuitable, is documented
in tools/README.md.

Usage:
    python3 fetch_wiki_photos.py <module-id> <sources.json>

sources.json maps each item id to either a Wikipedia page title to look
up (its lead image is used), or a direct image URL override:

    {
      "lion": "Lion",
      "fusilli": "https://upload.wikimedia.org/wikipedia/commons/a/aa/Fusilli_pasta.jpg"
    }

Already-fetched items (output file exists) are skipped on rerun, so a
large module can be filled in across several sessions; pass --force to
re-fetch everything.
"""
import argparse
import io
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

UA = "MemoryGameContentBot/1.0 (educational kids flashcard app; contact jhebert@gmail.com)"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fetch_summary(title):
    url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def width_url(url, w):
    # Wikimedia thumb URLs only accept specific widths server-side; this
    # only works for already-thumbnail URLs (.../thumb/.../NNNpx-name),
    # not full-size originals.
    m = re.search(r"/(\d+)px-", url)
    if m:
        return re.sub(r"/\d+px-", f"/{w}px-", url)
    return url


def crop_to_ratio(im, target_w, target_h):
    w, h = im.size
    target_ratio = target_w / target_h
    cur_ratio = w / h
    if cur_ratio > target_ratio:
        new_w = int(h * target_ratio)
        x0 = (w - new_w) // 2
        im = im.crop((x0, 0, x0 + new_w, h))
    else:
        new_h = int(w / target_ratio)
        # Bias toward the top rather than dead-center: portrait photos
        # usually frame the subject (an animal's head, a food's shape)
        # closer to the top of the frame.
        y0 = (h - new_h) // 4
        im = im.crop((0, y0, w, y0 + new_h))
    return im.resize((target_w, target_h), Image.LANCZOS)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("module_id", help="e.g. 'animals' writes to images/animals/")
    parser.add_argument("sources", help="path to a sources JSON file (see module docstring)")
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument(
        "--force", action="store_true", help="re-fetch even if the output file already exists"
    )
    args = parser.parse_args()

    out_dir = os.path.join(REPO_ROOT, "images", args.module_id)
    os.makedirs(out_dir, exist_ok=True)
    sources = json.load(open(args.sources))

    for item_id, source in sources.items():
        out_path = os.path.join(out_dir, item_id + ".jpg")
        if os.path.exists(out_path) and not args.force:
            print(item_id, "SKIP (already exists)")
            continue

        if source.startswith("http"):
            image_url = source
        else:
            try:
                summary = fetch_summary(source)
            except (urllib.error.URLError, urllib.error.HTTPError) as e:
                print(item_id, "SUMMARY FETCH FAILED", e)
                continue
            orig = summary.get("originalimage", {})
            if not orig.get("source"):
                print(
                    item_id,
                    "NO LEAD IMAGE -- find one on Wikimedia Commons and add a direct URL"
                    " override in",
                    args.sources,
                )
                continue
            image_url = orig["source"]

        dl_url = width_url(image_url, 1280)
        req = urllib.request.Request(dl_url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            print(item_id, "DOWNLOAD FAILED", e)
            continue

        im = Image.open(io.BytesIO(data)).convert("RGB")
        im = crop_to_ratio(im, args.width, args.height)
        im.save(out_path, "JPEG", quality=85, optimize=True)
        print(item_id, "OK ->", os.path.relpath(out_path, REPO_ROOT))


if __name__ == "__main__":
    main()
