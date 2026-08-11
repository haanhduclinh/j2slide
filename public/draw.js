/** Shared SVG drawing primitives for pure slide renderers. */

export const CANVAS = { w: 1600, h: 900, pad: 64 };

export const TITLE_Y = 128;
export const RULE_Y = 152;
export const CONTENT_TOP = 210;
export const CONTENT_BOTTOM = 800;
export const FOOTER_Y = 852;
export const ROTATE_LABELS_ABOVE = 8;

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
