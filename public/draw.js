/** Shared SVG drawing primitives for pure slide renderers. */

export const CANVAS = { w: 1600, h: 900, pad: 64 };

export const TITLE_Y = 128;
export const RULE_Y = 152;
export const CONTENT_TOP = 210;
export const CONTENT_BOTTOM = 800;
export const FOOTER_Y = 852;
export const ROTATE_LABELS_ABOVE = 8;

/** Above this count, skip per-point value labels (too dense on 16:9). */
export const HIDE_POINT_VALUES_ABOVE = 16;

/**
 * Pick which category indices keep a label when the axis is crowded.
 * Always includes first and last; steps so roughly ≤12 labels show.
 */
export function labelIndices(count, maxLabels = 12) {
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const indices = new Set([0, count - 1]);
  const step = (count - 1) / (maxLabels - 1);
  for (let k = 1; k < maxLabels - 1; k++) {
    indices.add(Math.round(k * step));
  }
  return [...indices].sort((a, b) => a - b);
}

export function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Rounds to 2dp and never emits NaN, which would silently break the SVG. */
export function n(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function text(content, x, y, opts = {}) {
  // class before font-size so tests can match class="bullet"[^>]*font-size="..."
  const attrs = [
    `x="${n(x)}"`,
    `y="${n(y)}"`,
    opts.className ? `class="${opts.className}"` : "",
    `font-size="${opts.size ?? 24}"`,
    `fill="${opts.fill ?? "#000"}"`,
    `font-family="${opts.family ?? ""}"`,
    opts.weight ? `font-weight="${opts.weight}"` : "",
    opts.anchor ? `text-anchor="${opts.anchor}"` : "",
    opts.baseline ? `dominant-baseline="${opts.baseline}"` : "",
    opts.transform ? `transform="${opts.transform}"` : "",
  ].filter(Boolean).join(" ");
  return `<text ${attrs}>${esc(content)}</text>`;
}

export function formatValue(value, unit) {
  const rounded = Math.round(value * 100) / 100;
  return unit ? `${rounded} ${unit}` : String(rounded);
}
