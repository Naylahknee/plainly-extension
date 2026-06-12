#!/usr/bin/env python3
"""
Generate Plainly's icon PNGs (16/48/128) without any image libraries.

The icon: a calm periwinkle-indigo rounded square with a soft white
"speech bubble" dot — Plainly's "translation" motif. Pure-Python PNG
writer (zlib + struct), so it runs anywhere Python runs.

Usage:  python3 scripts/make_icons.py
"""

import struct
import zlib
import math
import os

# Plainly brand colors (matches --plainly-accent in styles.css)
BG_TOP = (91, 110, 225)      # #5b6ee1
BG_BOTTOM = (127, 182, 164)  # #7fb6a4 (gradient partner)
DOT = (255, 255, 255)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_rect_alpha(x, y, size, radius):
    """1.0 inside a rounded square, 0.0 outside, soft edge in between."""
    half = size / 2
    cx, cy = abs(x - half + 0.5), abs(y - half + 0.5)
    inner = half - radius
    dx, dy = max(cx - inner, 0), max(cy - inner, 0)
    dist = math.hypot(dx, dy)
    return max(0.0, min(1.0, radius - dist + 0.5))


def make_icon(size):
    radius = size * 0.22
    # The "speech dot": a white circle, slightly above center.
    dot_cx, dot_cy, dot_r = size * 0.5, size * 0.44, size * 0.2
    # The "tail": small circle below-right, like a quote bubble tail.
    tail_cx, tail_cy, tail_r = size * 0.62, size * 0.68, size * 0.09

    rows = []
    for y in range(size):
        row = bytearray([0])  # PNG filter byte: 0 = None
        for x in range(size):
            shape_a = rounded_rect_alpha(x, y, size, radius)
            # Diagonal gradient background.
            t = (x + y) / (2 * size)
            r, g, b = lerp(BG_TOP, BG_BOTTOM, t)

            # Blend in the white dot + tail with soft (anti-aliased) edges.
            for (ccx, ccy, cr) in ((dot_cx, dot_cy, dot_r), (tail_cx, tail_cy, tail_r)):
                d = math.hypot(x + 0.5 - ccx, y + 0.5 - ccy)
                a = max(0.0, min(1.0, cr - d + 0.5))
                if a > 0:
                    r = round(r + (DOT[0] - r) * a)
                    g = round(g + (DOT[1] - g) * a)
                    b = round(b + (DOT[2] - b) * a)

            row += bytes((r, g, b, round(255 * shape_a)))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size):
    raw = make_icon(size)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate Plainly icons")
    parser.add_argument("--sizes", default="16,48,128",
                        help="comma-separated pixel sizes (default: 16,48,128)")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "assets"),
                        help="output directory (default: assets/)")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    for s in (int(x) for x in args.sizes.split(",")):
        write_png(os.path.join(args.out, f"icon{s}.png"), s)
