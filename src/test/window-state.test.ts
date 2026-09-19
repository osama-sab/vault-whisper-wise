import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { clampBounds, MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT } =
  require("../../electron/window-state.cjs") as typeof import("../../electron/window-state.cjs");

type Rect = { x: number; y: number; width: number; height: number };
const display = (x: number, y: number, width: number, height: number) => ({ workArea: { x, y, width, height } });

/** A single 1920x1080 monitor with a taskbar. */
const ONE = [display(0, 0, 1920, 1040)];
/** A laptop with a second monitor to its left, which is the negative-x case. */
const TWO = [display(0, 0, 1920, 1040), display(-1920, 0, 1920, 1040)];

const within = (b: Rect, area: Rect) =>
  b.x >= area.x && b.y >= area.y &&
  b.x + b.width <= area.x + area.width &&
  b.y + b.height <= area.y + area.height;

describe("clampBounds — nothing saved", () => {
  it("centres the default size on the primary display", () => {
    const b = clampBounds(null, ONE);
    expect(b.width).toBe(DEFAULT_WIDTH);
    expect(b.height).toBe(DEFAULT_HEIGHT);
    expect(b.x).toBe(Math.round((1920 - DEFAULT_WIDTH) / 2));
    expect(within(b as Rect, ONE[0].workArea)).toBe(true);
  });

  it("shrinks the default to fit a small display", () => {
    const b = clampBounds(null, [display(0, 0, 1024, 720)]);
    expect(b.width).toBeLessThanOrEqual(1024);
    expect(b.height).toBeLessThanOrEqual(720);
  });

  it("does not crash when there are no displays at all", () => {
    const b = clampBounds({ x: 0, y: 0, width: 800, height: 600 }, []);
    expect(b.width).toBe(DEFAULT_WIDTH);
    expect(b.x).toBeUndefined(); // let Electron place it
  });
});

describe("clampBounds — corrupt saved state", () => {
  const rubbish = [
    undefined, null, {}, "nonsense",
    { x: 0, y: 0, width: 0, height: 0 },
    { x: 0, y: 0, width: -100, height: 600 },
    { x: NaN, y: 0, width: 800, height: 600 },
    { x: 0, y: 0, width: Infinity, height: 600 },
    { x: 0, y: 0, width: "800", height: 600 },
    { x: 0, y: 0, width: null, height: 600 },
  ];

  it.each(rubbish.map((r) => [JSON.stringify(r) ?? String(r), r] as const))(
    "falls back to a sane window for %s",
    (_label, saved) => {
      const b = clampBounds(saved as never, ONE);
      expect(b.width).toBeGreaterThanOrEqual(MIN_WIDTH);
      expect(b.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
      expect(Number.isFinite(b.x)).toBe(true);
      expect(within(b as Rect, ONE[0].workArea)).toBe(true);
    }
  );
});

describe("clampBounds — ordinary restore", () => {
  it("returns a window that already fits unchanged", () => {
    const saved = { x: 200, y: 120, width: 1280, height: 860 };
    expect(clampBounds(saved, ONE)).toEqual(saved);
  });

  it("keeps a window on the secondary display it was left on", () => {
    const saved = { x: -1800, y: 100, width: 1200, height: 800 };
    const b = clampBounds(saved, TWO);
    expect(b.x).toBeLessThan(0);
    expect(within(b as Rect, TWO[1].workArea)).toBe(true);
  });
});

describe("clampBounds — the display changed", () => {
  it("pulls a window back when its monitor has been unplugged", () => {
    // Saved on the left-hand monitor; now only the primary exists.
    const b = clampBounds({ x: -1800, y: 100, width: 1200, height: 800 }, ONE);
    expect(within(b as Rect, ONE[0].workArea)).toBe(true);
  });

  it("shrinks a window that no longer fits the screen", () => {
    const b = clampBounds({ x: 0, y: 0, width: 3000, height: 2000 }, [display(0, 0, 1366, 720)]);
    expect(b.width).toBeLessThanOrEqual(1366);
    expect(b.height).toBeLessThanOrEqual(720);
  });

  it("pulls back a window dragged off the right edge", () => {
    const b = clampBounds({ x: 1900, y: 500, width: 1200, height: 800 }, ONE);
    expect(within(b as Rect, ONE[0].workArea)).toBe(true);
  });

  it("pulls back a window left above the top edge", () => {
    // The classic: the title bar ends up unreachable.
    const b = clampBounds({ x: 300, y: -400, width: 1200, height: 800 }, ONE);
    expect(b.y).toBeGreaterThanOrEqual(0);
  });

  it("handles a display whose origin is not 0,0", () => {
    const offset = [display(1920, -200, 1920, 1040)];
    const b = clampBounds({ x: 0, y: 0, width: 1200, height: 800 }, offset);
    expect(within(b as Rect, offset[0].workArea)).toBe(true);
  });
});

describe("clampBounds — size limits", () => {
  it("never returns a window below the minimum the layout needs", () => {
    const b = clampBounds({ x: 0, y: 0, width: 200, height: 150 }, ONE);
    expect(b.width).toBe(MIN_WIDTH);
    expect(b.height).toBe(MIN_HEIGHT);
  });

  it("prefers the minimum over a display too small to hold it", () => {
    // A cramped window is worse than one that overflows a tiny screen.
    const b = clampBounds({ x: 0, y: 0, width: 1200, height: 800 }, [display(0, 0, 640, 480)]);
    expect(b.width).toBe(MIN_WIDTH);
    expect(b.height).toBe(MIN_HEIGHT);
  });

  it("always returns whole pixels", () => {
    const b = clampBounds({ x: 10.4, y: 20.6, width: 1200.5, height: 800.5 }, ONE);
    for (const v of [b.x, b.y]) expect(Number.isInteger(v)).toBe(true);
  });
});

describe("clampBounds — is stable", () => {
  it("clamping an already-clamped result changes nothing", () => {
    // Otherwise the window would creep across the screen on every launch.
    for (const saved of [
      { x: -5000, y: -5000, width: 4000, height: 3000 },
      { x: 1900, y: 1000, width: 1200, height: 800 },
      { x: 0, y: 0, width: 100, height: 100 },
    ]) {
      const once = clampBounds(saved, TWO);
      const twice = clampBounds(once, TWO);
      expect(twice).toEqual(once);
    }
  });
});
