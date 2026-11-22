#!/usr/bin/env python3
"""Generate the PWA icons (pure stdlib, no PIL needed)."""
import math
import os
import struct
import zlib

ECG = [(0.06, 0.55), (0.28, 0.55), (0.34, 0.48), (0.40, 0.58), (0.47, 0.26),
       (0.53, 0.74), (0.60, 0.50), (0.66, 0.55), (0.94, 0.55)]
TOP = (10, 132, 255)
BOTTOM = (90, 200, 250)


def write_png(path, w, h, pix):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw.extend(pix[y * w * 4:(y + 1) * w * 4])

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
           chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def rr_dist(px, py, w, h, r):
    cx = max(r, min(px, w - r))
    cy = max(r, min(py, h - r))
    return math.hypot(px - cx, py - cy) - r


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / l2))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def render(size, maskable):
    ss = 4 if size <= 192 else 3
    S = size * ss
    if maskable:
        pts = [((0.10 + x * 0.80) * S, (0.10 + y * 0.80) * S) for x, y in ECG]
        lw = size * ss * 0.045
        radius = 0.0
    else:
        pts = [(x * S, y * S) for x, y in ECG]
        lw = size * ss * 0.05
        radius = S * 0.2235
    pix = bytearray(S * S * 4)
    segs = [(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) for i in range(len(pts) - 1)]
    for py in range(S):
        bg = lerp(TOP, BOTTOM, py / (S - 1))
        row = py * S * 4
        for px in range(S):
            i = row + px * 4
            if not maskable and rr_dist(px + 0.5, py + 0.5, S, S, radius) > 0:
                continue
            r, g, b = bg
            dmin = min(seg_dist(px + 0.5, py + 0.5, *s) for s in segs)
            if dmin <= lw / 2:
                r, g, b = 255, 255, 255
            pix[i] = r
            pix[i + 1] = g
            pix[i + 2] = b
            pix[i + 3] = 255
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            acc = [0, 0, 0, 0]
            for dy in range(ss):
                base = ((y * ss + dy) * S) * 4
                for dx in range(ss):
                    si = base + (x * ss + dx) * 4
                    acc[0] += pix[si]
                    acc[1] += pix[si + 1]
                    acc[2] += pix[si + 2]
                    acc[3] += pix[si + 3]
            n = ss * ss
            oi = (y * size + x) * 4
            for c in range(4):
                out[oi + c] = acc[c] // n
    return size, size, out


def main():
    outdir = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'icons'))
    os.makedirs(outdir, exist_ok=True)
    jobs = [
        ('apple-touch-icon-180.png', 180, False),
        ('icon-192.png', 192, False),
        ('icon-512.png', 512, False),
        ('icon-512-maskable.png', 512, True),
    ]
    for name, size, maskable in jobs:
        w, h, pix = render(size, maskable)
        path = os.path.join(outdir, name)
        write_png(path, w, h, pix)
        print('wrote', path, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
