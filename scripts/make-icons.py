"""
Draw the Pocket Money mark and write the raster icons.

The in-app mark lives in src/components/BrandMark.tsx as SVG; this draws the
same geometry (a wallet on a teal tile) at 4x supersampling for the files the
OS needs — the window and taskbar icon, and the PWA manifest icons.

    python scripts/make-icons.py

Requires only Pillow. Re-run it if the mark or the primary colour changes.
"""

from PIL import Image, ImageDraw

# hsl(173 80% 30%) -> #0F8A7D, hsl(173 70% 45%) -> #22C3B0, the two primary stops.
PRIMARY = (15, 138, 125)
GLOW = (34, 195, 176)
WHITE = (255, 255, 255)

S = 4  # supersample factor


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def draw_mark(px):
    """Render the mark at `px` pixels square, with alpha."""
    n = px * S
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))

    # Diagonal gradient tile, masked to a rounded square.
    grad = Image.new("RGBA", (n, n))
    gp = grad.load()
    for y in range(n):
        for x in range(n):
            gp[x, y] = lerp(GLOW, PRIMARY, (x + y) / (2 * n - 2)) + (255,)
    mask = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=round(n * 13 / 48), fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    u = n / 48.0  # the SVG's 48-unit box

    # Wallet body.
    d.rounded_rectangle(
        [10 * u, 14 * u, 36 * u, 35 * u], radius=6 * u, fill=WHITE + (245,)
    )
    # Card slot, cut into the body's right edge.
    d.rounded_rectangle(
        [23.5 * u, 21 * u, 40 * u, 28 * u], radius=3.5 * u, fill=PRIMARY + (235,)
    )
    # Clasp.
    d.ellipse(
        [(30.5 - 1.9) * u, (24.5 - 1.9) * u, (30.5 + 1.9) * u, (24.5 + 1.9) * u], fill=WHITE
    )

    return img.resize((px, px), Image.LANCZOS)


def main():
    draw_mark(512).save("public/pwa-512.png")
    draw_mark(192).save("public/pwa-192.png")
    # .ico carries every size Windows picks from; without the small ones the
    # taskbar downsamples the 256 and the mark goes muddy.
    sizes = [16, 24, 32, 48, 64, 128, 256]
    base = draw_mark(256)
    base.save("public/favicon.ico", sizes=[(s, s) for s in sizes])
    print("wrote public/pwa-512.png, public/pwa-192.png, public/favicon.ico")


if __name__ == "__main__":
    main()
