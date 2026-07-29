#!/usr/bin/env python3
"""
Render Plainly's logo to PNGs using headless Chromium (no image libraries).

The mark: a rounded-square in Plainly's indigo->sage gradient, a clean white
lowercase "p" (for Plainly), and the product's signature dotted underline.

Outputs:
  assets/icon16.png  icon48.png  icon128.png      (extension)
  web/icons/icon192.png  icon512.png              (PWA)
  store/screenshots/promo-440x280.png             (store promo tile)

Usage:  python3 scripts/make_logo.py
"""
import os
import struct
import subprocess
import tempfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def png_decode_rgba(path):
    """Minimal PNG decoder for 8-bit RGBA (what Chrome writes). Returns
    (width, height, bytearray of w*h*4 unfiltered RGBA)."""
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, w, h, idat = 8, 0, 0, bytearray()
    while pos < len(data):
        (ln,) = struct.unpack(">I", data[pos:pos + 4])
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if tag == b"IHDR":
            w, h, bit, color = struct.unpack(">IIBB", body[:10])
            assert bit == 8 and color == 6, "expected 8-bit RGBA"
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break
        pos += 12 + ln
    raw = zlib.decompress(bytes(idat))
    stride = w * 4
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        ft = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if ft == 1:
            for i in range(4, stride):
                line[i] = (line[i] + line[i - 4]) & 255
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif ft == 3:
            for i in range(stride):
                a = line[i - 4] if i >= 4 else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif ft == 4:
            for i in range(stride):
                a = line[i - 4] if i >= 4 else 0
                c = prev[i - 4] if i >= 4 else 0
                line[i] = (line[i] + _paeth(a, prev[i], c)) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, out


def png_write_rgba(path, w, h, rgba):
    """Write 8-bit RGBA with filter 0 on every row."""
    stride = w * 4
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, body):
        return (struct.pack(">I", len(body)) + tag + body
                + struct.pack(">I", zlib.crc32(tag + body)))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    open(path, "wb").write(png)


def crop_top_left(src, dst, cw, ch):
    """Crop the top-left cw x ch pixels of a PNG."""
    w, h, rgba = png_decode_rgba(src)
    stride = w * 4
    out = bytearray(ch * cw * 4)
    for y in range(ch):
        out[y * cw * 4:(y + 1) * cw * 4] = rgba[y * stride:y * stride + cw * 4]
    png_write_rgba(dst, cw, ch, out)

GRAD_TOP = "#5b6ee1"
GRAD_BOTTOM = "#7fb6a4"


def mark_svg(size, underline=True):
    """The square app-icon mark as a self-contained SVG string."""
    dots = ""
    if underline:
        dots = (
            '<g fill="white">'
            '<circle cx="46" cy="112" r="5.2"/>'
            '<circle cx="66" cy="112" r="5.2"/>'
            '<circle cx="86" cy="112" r="5.2"/>'
            "</g>"
        )
    return f"""
<svg width="{size}" height="{size}" viewBox="0 0 128 128"
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{GRAD_TOP}"/>
      <stop offset="1" stop-color="{GRAD_BOTTOM}"/>
    </linearGradient>
    <mask id="p">
      <rect x="0" y="0" width="128" height="128" fill="black"/>
      <rect x="41" y="30" width="16" height="70" rx="8" fill="white"/>
      <circle cx="70" cy="55" r="27" fill="white"/>
      <circle cx="73" cy="55" r="12.5" fill="black"/>
    </mask>
  </defs>
  <rect x="0" y="0" width="128" height="128" rx="29" fill="url(#g)"/>
  <rect x="0" y="0" width="128" height="128" fill="white" mask="url(#p)"/>
  {dots}
</svg>"""


def promo_svg(w, h):
    """The 440x280 store promo tile: mark + wordmark + tagline."""
    icon = 120
    ix, iy = 40, (h - icon) // 2
    tx = ix + icon + 30
    return f"""
<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}"
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{GRAD_TOP}"/>
      <stop offset="1" stop-color="{GRAD_BOTTOM}"/>
    </linearGradient>
    <mask id="p2">
      <rect x="0" y="0" width="128" height="128" fill="black"/>
      <rect x="41" y="30" width="16" height="70" rx="8" fill="white"/>
      <circle cx="70" cy="55" r="27" fill="white"/>
      <circle cx="73" cy="55" r="12.5" fill="black"/>
    </mask>
  </defs>
  <rect x="0" y="0" width="{w}" height="{h}" fill="url(#bg)"/>
  <g transform="translate({ix},{iy}) scale({icon/128})">
    <rect x="0" y="0" width="128" height="128" rx="29" fill="#ffffff" opacity="0.16"/>
    <rect x="0" y="0" width="128" height="128" fill="white" mask="url(#p2)"/>
    <g fill="white">
      <circle cx="46" cy="112" r="5.2"/>
      <circle cx="66" cy="112" r="5.2"/>
      <circle cx="86" cy="112" r="5.2"/>
    </g>
  </g>
  <text x="{tx}" y="{h//2 - 6}" fill="white"
        font-family="'Liberation Sans','DejaVu Sans',sans-serif"
        font-size="56" font-weight="700"
        letter-spacing="-1">Plainly</text>
  <text x="{tx}" y="{h//2 + 28}" fill="white" opacity="0.92"
        font-family="'Liberation Sans','DejaVu Sans',sans-serif"
        font-size="18">Jargon, in plain English</text>
</svg>"""


def render(svg, out, w, h):
    # Chrome mis-sizes an embedded/standalone SVG when the window height
    # equals the content height exactly, but renders it correctly (top-left
    # anchored) inside a LARGER window. So render into a padded window and
    # crop the exact top-left w x h region back out.
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg)
        path = f.name
    shot = out + ".full.png"
    try:
        subprocess.run(
            [CHROME, "--headless", "--disable-gpu", "--no-sandbox",
             "--hide-scrollbars", "--force-color-profile=srgb",
             "--force-device-scale-factor=1",
             "--default-background-color=00000000",
             f"--screenshot={shot}", f"--window-size={w},{h + 120}",
             f"file://{path}"],
            check=True, capture_output=True,
        )
        crop_top_left(shot, out, w, h)
        print(f"wrote {os.path.relpath(out, ROOT)} ({w}x{h})")
    finally:
        os.unlink(path)
        if os.path.exists(shot):
            os.unlink(shot)


def main():
    a = os.path.join(ROOT, "assets")
    wi = os.path.join(ROOT, "web", "icons")
    ss = os.path.join(ROOT, "store", "screenshots")
    os.makedirs(wi, exist_ok=True)

    # Extension icons. 16px drops the underline (too small to read).
    render(mark_svg(16, underline=False), os.path.join(a, "icon16.png"), 16, 16)
    render(mark_svg(48), os.path.join(a, "icon48.png"), 48, 48)
    render(mark_svg(128), os.path.join(a, "icon128.png"), 128, 128)

    # PWA icons.
    render(mark_svg(192), os.path.join(wi, "icon192.png"), 192, 192)
    render(mark_svg(512), os.path.join(wi, "icon512.png"), 512, 512)

    # Store promo tile.
    render(promo_svg(440, 280), os.path.join(ss, "promo-440x280.png"), 440, 280)


if __name__ == "__main__":
    main()
