/**
 * Remember the window's size and position between runs.
 *
 * The interesting part is not saving it, it is restoring it safely. A window
 * restored blindly from disk can land somewhere the user cannot reach:
 * off the edge of a smaller screen, on a monitor that has been unplugged, or
 * sized larger than the display it now lands on. clampBounds() is written as a
 * pure function precisely so every one of those cases can be tested.
 */

const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 860;

/** How much of the window must remain on screen to stay grabbable. */
const VISIBLE_MARGIN = 80;

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isValidBounds(b) {
  return !!b
    && isFiniteNumber(b.x) && isFiniteNumber(b.y)
    && isFiniteNumber(b.width) && isFiniteNumber(b.height)
    && b.width > 0 && b.height > 0;
}

/** Area of the intersection of two rectangles; 0 when they do not overlap. */
function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

/**
 * Fit saved bounds onto the displays that actually exist right now.
 *
 * @param saved     bounds read from disk, possibly nonsense
 * @param displays  [{ workArea: { x, y, width, height } }, ...]
 * @param opts      { minWidth, minHeight, defaultWidth, defaultHeight }
 * @returns { x, y, width, height } that is guaranteed reachable
 */
function clampBounds(saved, displays, opts = {}) {
  const minWidth = opts.minWidth ?? MIN_WIDTH;
  const minHeight = opts.minHeight ?? MIN_HEIGHT;
  const defaultWidth = opts.defaultWidth ?? DEFAULT_WIDTH;
  const defaultHeight = opts.defaultHeight ?? DEFAULT_HEIGHT;

  const areas = (displays || [])
    .map((d) => d && d.workArea)
    .filter((a) => isValidBounds(a));

  // No display information at all: hand back defaults and let Electron place it.
  if (areas.length === 0) {
    return { x: undefined, y: undefined, width: defaultWidth, height: defaultHeight };
  }

  const usable = !isValidBounds(saved);
  const primary = areas[0];

  // Centre the default size on the primary display.
  if (usable) {
    const width = Math.min(defaultWidth, primary.width);
    const height = Math.min(defaultHeight, primary.height);
    return {
      x: Math.round(primary.x + (primary.width - width) / 2),
      y: Math.round(primary.y + (primary.height - height) / 2),
      width,
      height,
    };
  }

  // Land on whichever display the window most overlapped; if the saved
  // position is on no current display (monitor unplugged, resolution change),
  // fall back to the primary one.
  let target = primary;
  let best = 0;
  for (const area of areas) {
    const covered = overlapArea(saved, area);
    if (covered > best) {
      best = covered;
      target = area;
    }
  }

  // Never larger than the display, never smaller than the app can render.
  // The min wins if the display itself is tiny — better a window that
  // overflows a small screen than a layout squeezed past breaking point.
  const width = Math.max(minWidth, Math.min(saved.width, target.width));
  const height = Math.max(minHeight, Math.min(saved.height, target.height));

  // Keep it grabbable: at least VISIBLE_MARGIN of the window inside the work
  // area on every side, and the title bar never above the top edge.
  const maxX = target.x + target.width - VISIBLE_MARGIN;
  const minX = target.x - width + VISIBLE_MARGIN;
  const maxY = target.y + target.height - VISIBLE_MARGIN;
  const minY = target.y;

  let x = Math.round(Math.min(maxX, Math.max(minX, saved.x)));
  let y = Math.round(Math.min(maxY, Math.max(minY, saved.y)));

  // When it fits entirely, prefer fully on-screen over merely reachable.
  if (width <= target.width) x = Math.min(Math.max(x, target.x), target.x + target.width - width);
  if (height <= target.height) y = Math.min(Math.max(y, target.y), target.y + target.height - height);

  return { x, y, width, height };
}

module.exports = { clampBounds, MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT, isValidBounds };
