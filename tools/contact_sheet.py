#!/usr/bin/env python3
"""Build a labeled grid contact sheet from a directory of images, for
quick visual review of an entire module's photos at once — catching bad
crops, wrong poses, or images that don't match their `alt` text before
publishing a module. Open the output PNG to review.

Usage:
    python3 contact_sheet.py images/animals/ /tmp/animals_contact_sheet.png
"""
import argparse
import os

from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("image_dir")
    parser.add_argument("output", help="output PNG path, e.g. contact_sheet.png")
    parser.add_argument("--cols", type=int, default=4)
    parser.add_argument("--thumb-width", type=int, default=240)
    parser.add_argument("--thumb-height", type=int, default=180)
    args = parser.parse_args()

    files = sorted(
        f for f in os.listdir(args.image_dir) if f.lower().endswith((".jpg", ".jpeg", ".png"))
    )
    if not files:
        raise SystemExit(f"no images found in {args.image_dir}")

    cols = args.cols
    rows = -(-len(files) // cols)  # ceil
    label_h = 22
    cell_w, cell_h = args.thumb_width, args.thumb_height + label_h
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "white")
    draw = ImageDraw.Draw(sheet)

    for i, fn in enumerate(files):
        im = Image.open(os.path.join(args.image_dir, fn)).convert("RGB")
        im = im.resize((args.thumb_width, args.thumb_height))
        r, c = divmod(i, cols)
        x, y = c * cell_w, r * cell_h
        sheet.paste(im, (x, y))
        draw.text((x + 4, y + args.thumb_height + 2), fn, fill="black")

    sheet.save(args.output)
    print(f"wrote {args.output} ({len(files)} images, {cols}x{rows} grid)")


if __name__ == "__main__":
    main()
