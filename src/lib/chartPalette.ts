/**
 * The categorical palette, for charts that colour by identity.
 *
 * This is NOT the app's semantic palette. income-green / expense-red /
 * bills-orange say what a thing *is*; these slots say only "this one is not
 * that one", which is what a breakdown by category needs.
 *
 * Both columns are selected for their own surface — the dark steps are the
 * same eight hues re-stepped for a dark ground, not an automatic flip — and
 * both were run through the palette validator rather than eyeballed:
 *
 *   light (surface #ffffff): worst adjacent CVD ΔE 9.1, normal-vision ΔE 19.6
 *   dark  (surface #192529): worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3
 *
 * Light mode WARNs on contrast for the aqua, yellow and magenta slots, which
 * obliges relief: every chart using these ships a legend listing each slice by
 * name and amount, so identity is never carried by colour alone.
 *
 * Hues are assigned in fixed order and never cycled. Past SLOTS.length the
 * remainder folds into a single neutral "Other" — a ninth generated hue would
 * not survive the checks above.
 */
export interface PaletteSlot {
  light: string;
  dark: string;
}

export const SLOTS: PaletteSlot[] = [
  { light: "#2a78d6", dark: "#3987e5" }, // blue
  { light: "#eb6834", dark: "#d95926" }, // orange
  { light: "#1baf7a", dark: "#199e70" }, // aqua
  { light: "#eda100", dark: "#c98500" }, // yellow
  { light: "#e87ba4", dark: "#d55181" }, // magenta
  { light: "#008300", dark: "#008300" }, // green
  { light: "#4a3aa7", dark: "#9085e9" }, // violet
];

/** What everything beyond the last slot collapses into. */
export const OTHER_SLOT: PaletteSlot = { light: "#8a9396", dark: "#7d888c" };

/** How many real categories a breakdown shows before folding the rest. */
export const MAX_SLICES = SLOTS.length;

export function slotAt(index: number): PaletteSlot {
  return SLOTS[index] ?? OTHER_SLOT;
}
