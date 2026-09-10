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

  // `lines` renders a wrapped run: one tspan per line, re-anchored at x so the
  // block stays left-aligned instead of drifting with each dy.
  if (opts.lines) {
    const step = opts.lineHeight ?? Math.round((opts.size ?? 24) * 1.3);
    const spans = opts.lines
      .map((line, i) => `<tspan x="${n(x)}" dy="${i === 0 ? 0 : step}">${esc(line)}</tspan>`)
      .join("");
    return `<text ${attrs}>${spans}</text>`;
  }

  return `<text ${attrs}>${esc(content)}</text>`;
}

/**
 * Advance widths in em for the shared sans stack.
 *
 * Measured with SVG `getComputedTextLength` across 14–92px in both weights —
 * SVG rather than canvas because that is what these renderers emit, and the
 * two disagree by up to 13% at isolated sizes. Each bucket carries the widest
 * value any of its glyphs reached at any size, so the estimate is a dependable
 * upper bound: text that wraps a word early looks fine, text that overruns its
 * box does not.
 */
const ADVANCE = new Map();
for (const [chars, em] of [
  ["ijl|", 0.25],
  // Measured by difference, since SVG collapses a run of spaces.
  [" ", 0.262],
  ["',.:;I\u00b7", 0.277],
  ["!/\\", 0.303],
  ["ft", 0.344],
  ["()[]r{}", 0.371],
  ['"*-1\u00b0\u2022', 0.458],
  ["?`sxz", 0.519],
  ["FJL_acekvy", 0.553],
  ["257Ebdghnopqu\u2013", 0.599],
  ["#$+034689<=>BKPRSTY^~\u0111\u00d7", 0.639],
  ["AVXZ", 0.659],
  ["&CDU", 0.74],
  ["GHNOQw\u0110", 0.755],
  ["\u2026", 0.85],
  ["Mm\u2014", 0.867],
  ["%@\u2192\u2190", 0.919],
  ["W", 0.948],
]) {
  for (const ch of chars) ADVANCE.set(ch, em);
}

const BOLD_RATIO = 1.09;
/**
 * Covers the residual few percent at sizes and fallback fonts the table was
 * not calibrated at. Without it, odd sizes drift a little under the real
 * width, which is the one direction that reintroduces overlap.
 */
const SAFETY = 1.03;
/** Unknown glyphs (CJK, emoji) are assumed full-width — the safe direction. */
const FALLBACK_EM = 1;

/**
 * Upper bound on the rendered width of `str`, in user units.
 *
 * Renderers are pure string builders with no DOM, so they cannot measure text
 * on a canvas; this stands in for that. It reads a few percent wide by
 * design — see ADVANCE above.
 */
export function measureText(str, size, weight) {
  let em = 0;
  for (const ch of String(str)) {
    let advance = ADVANCE.get(ch);
    if (advance === undefined) {
      // Vietnamese tone marks decompose away, leaving a base letter we know.
      advance = ADVANCE.get(ch.normalize("NFD")[0]) ?? FALLBACK_EM;
    }
    em += advance;
  }
  return em * size * SAFETY * (weight === "700" ? BOLD_RATIO : 1);
}

/** Largest size in [min, max] at which `str` fits `width` on one line. */
export function fitSize(str, width, max, min, weight) {
  const full = measureText(str, max, weight);
  if (full <= width) return max;
  return Math.max(min, Math.floor((width / full) * max));
}

/** Truncates with an ellipsis so the result fits `width`. */
export function ellipsize(str, width, size, weight) {
  const s = String(str);
  if (width <= 0) return "";
  if (measureText(s, size, weight) <= width) return s;
  let out = "";
  for (const ch of s) {
    if (measureText(out + ch + "\u2026", size, weight) > width) break;
    out += ch;
  }
  return out.trimEnd() + "\u2026";
}

/**
 * Greedy word wrap. Words longer than `width` are broken mid-word rather than
 * allowed to overhang. Returns at most `maxLines` lines, the last ellipsised.
 */
export function wrapText(str, width, size, maxLines = Infinity, weight) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  const push = () => { if (line) { lines.push(line); line = ""; } };

  for (let word of words) {
    // Break a word that cannot fit on a line of its own.
    while (measureText(word, size, weight) > width) {
      push();
      let head = "";
      for (const ch of word) {
        if (measureText(head + ch, size, weight) > width) break;
        head += ch;
      }
      if (!head) head = word[0];  // width smaller than one glyph; make progress
      lines.push(head);
      word = word.slice(head.length);
      if (lines.length >= maxLines) break;
    }
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (line && measureText(candidate, size, weight) > width) {
      push();
      line = word;
    } else {
      line = candidate;
    }
  }
  push();

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(`${kept[maxLines - 1]}\u2026`, width, size, weight);
  return kept;
}

/**
 * Wraps each bullet to `width`, shrinking the type until the whole list fits
 * `height`. Bullets are free text, so neither the line count nor the wrapped
 * height is known before a size is chosen — hence the search.
 *
 * @returns {{ size: number, lineHeight: number, lines: string[][] }}
 */
export function fitBullets(bullets, width, height, maxSize, minSize) {
  const gapAfter = (size) => size * 0.9;   // breathing room between bullets
  const lineHeightFor = (size) => size * 1.3;

  let size = maxSize;
  let lines = [];
  for (; size >= minSize; size -= 1) {
    lines = bullets.map((b) => wrapText(b, width, size, 4, "400"));
    const rows = lines.reduce((sum, l) => sum + l.length, 0);
    const total = rows * lineHeightFor(size) + (bullets.length - 1) * gapAfter(size);
    if (total <= height) break;
  }
  size = Math.max(size, minSize);
  return { size, lineHeight: lineHeightFor(size), lines, gap: gapAfter(size) };
}

export function formatValue(value, unit) {
  const rounded = Math.round(value * 100) / 100;
  return unit ? `${rounded} ${unit}` : String(rounded);
}
