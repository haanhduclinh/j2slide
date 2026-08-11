/**
 * Composite slide: ordered blocks of image | text | chart in stack or split layout.
 */
import {
  CANVAS,
  CONTENT_TOP,
  CONTENT_BOTTOM,
  n,
  text,
  esc,
  formatValue,
} from "../draw.js";

const GAP = 16;
const COL_GUTTER = 24;
const INSET = 8;

function weightOf(block) {
  if (block.type === "image" || block.type === "chart") return 2;
  return 1;
}

/**
 * @param {object[]} blocks
 * @param {{ x: number, y: number, w: number, h: number }} area
 * @returns {{ block: object, box: { x: number, y: number, w: number, h: number } }[]}
 */
function layoutColumn(blocks, area) {
  if (blocks.length === 0) return [];
  const weights = blocks.map(weightOf);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const gaps = GAP * Math.max(0, blocks.length - 1);
  const usable = Math.max(0, area.h - gaps);
  let y = area.y;
  return blocks.map((block, i) => {
    const h = usable * (weights[i] / totalW);
    const box = { x: area.x, y, w: area.w, h };
    y += h + GAP;
    return { block, box };
  });
}

/**
 * @param {object} slide
 * @returns {{ block: object, box: { x: number, y: number, w: number, h: number } }[]}
 */
function placeBlocks(slide) {
  const blocks = slide.blocks;
  const content = {
    x: CANVAS.pad,
    y: CONTENT_TOP,
    w: CANVAS.w - CANVAS.pad * 2,
    h: CONTENT_BOTTOM - CONTENT_TOP,
  };

  let layout = slide.layout ?? "stack";
  if (blocks.length === 1) layout = "stack";

  if (layout === "stack") {
    return layoutColumn(blocks, content);
  }

  // split: first ceil(n/2) left, rest right
  const mid = Math.ceil(blocks.length / 2);
  const leftBlocks = blocks.slice(0, mid);
  const rightBlocks = blocks.slice(mid);
  const colW = (content.w - COL_GUTTER) / 2;
  const leftArea = { x: content.x, y: content.y, w: colW, h: content.h };
  const rightArea = {
    x: content.x + colW + COL_GUTTER,
    y: content.y,
    w: colW,
    h: content.h,
  };
  return [
    ...layoutColumn(leftBlocks, leftArea),
    ...layoutColumn(rightBlocks, rightArea),
  ];
}

function renderImageBlock(block, box) {
  const x = box.x + INSET;
  const y = box.y + INSET;
  const w = Math.max(0, box.w - INSET * 2);
  const h = Math.max(0, box.h - INSET * 2);
  return (
    `<image class="block-image" href="${esc(block.url)}" x="${n(x)}" y="${n(y)}" ` +
    `width="${n(w)}" height="${n(h)}" preserveAspectRatio="xMidYMid meet"/>`
  );
}

function renderTextBlock(block, box, theme) {
  const bullets = block.bullets;
  const count = bullets.length;
  const padX = box.x + INSET + 12;
  const top = box.y + INSET + 20;
  const bottom = box.y + box.h - INSET;
  const span = Math.max(1, bottom - top);
  const gap = span / (count + 1);
  const size = Math.max(18, Math.min(theme.bulletMinSize ?? 28, Math.floor(box.h / (count + 2))));

  return bullets.map((bullet, i) => {
    const y = top + gap * (i + 1);
    return [
      `<circle cx="${n(padX)}" cy="${n(y - 8)}" r="6" fill="${theme.accent}"/>`,
      text(bullet, padX + 28, y, {
        size,
        fill: theme.fg,
        family: theme.fontFamily,
        className: "bullet",
      }),
    ].join("\n");
  }).join("\n");
}

function renderBarInBox(block, box, theme) {
  const data = block.data;
  const left = box.x + INSET;
  const right = box.x + box.w - INSET;
  const width = right - left;
  const baseline = box.y + box.h - INSET - 28;
  const top = box.y + INSET + 12;
  const values = data.map((d) => d.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const zeroY = baseline - ((0 - min) / span) * (baseline - top);
  const slot = width / data.length;
  const barWidth = Math.min(48, slot * 0.6);
  const parts = [
    `<line x1="${n(left)}" y1="${n(zeroY)}" x2="${n(right)}" y2="${n(zeroY)}" stroke="${theme.grid}" stroke-width="2"/>`,
  ];
  data.forEach((point, i) => {
    const centre = left + slot * (i + 0.5);
    const valueY = baseline - ((point.value - min) / span) * (baseline - top);
    const y = Math.min(zeroY, valueY);
    const height = Math.abs(zeroY - valueY);
    const colour = theme.series[i % theme.series.length];
    parts.push(
      `<rect class="bar" x="${n(centre - barWidth / 2)}" y="${n(y)}" width="${n(barWidth)}" height="${n(height)}" rx="4" fill="${colour}"/>`,
    );
    if (data.length <= 8) {
      parts.push(text(point.label, centre, baseline + 20, {
        size: 16, fill: theme.muted, family: theme.fontFamily, anchor: "middle", className: "bar-label",
      }));
    }
  });
  return parts.join("\n");
}

function renderLineInBox(block, box, theme) {
  const data = block.data;
  const left = box.x + INSET + 8;
  const right = box.x + box.w - INSET;
  const baseline = box.y + box.h - INSET - 28;
  const top = box.y + INSET + 12;
  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = data.length > 1 ? (right - left) / (data.length - 1) : 0;
  const at = (i, value) => ({
    x: data.length > 1 ? left + step * i : (left + right) / 2,
    y: baseline - ((value - min) / span) * (baseline - top),
  });
  const points = data.map((d, i) => at(i, d.value));
  const parts = [
    `<line x1="${n(left)}" y1="${n(baseline)}" x2="${n(right)}" y2="${n(baseline)}" stroke="${theme.grid}" stroke-width="2"/>`,
    `<polyline fill="none" stroke="${theme.series[0]}" stroke-width="4" stroke-linejoin="round" points="${points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ")}"/>`,
  ];
  points.forEach((p, i) => {
    parts.push(`<circle class="point" cx="${n(p.x)}" cy="${n(p.y)}" r="5" fill="${theme.series[0]}"/>`);
    if (data.length <= 8) {
      parts.push(text(data[i].label, p.x, baseline + 20, {
        size: 16, fill: theme.muted, family: theme.fontFamily, anchor: "middle", className: "line-label",
      }));
    }
  });
  return parts.join("\n");
}

function renderRingInBox(block, box, theme, donut) {
  const data = block.data;
  const cx = box.x + box.w * (data.length > 4 ? 0.32 : 0.45);
  const cy = box.y + box.h / 2;
  const outer = Math.min(box.w, box.h) * 0.28;
  const inner = donut ? outer * 0.5 : outer * 0.45;
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const parts = [];

  if (total <= 0) {
    parts.push(
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n((outer + inner) / 2)}" fill="none" stroke="${theme.grid}" stroke-width="${n(outer - inner)}"/>`,
    );
  } else if (data.length === 1) {
    parts.push(
      `<circle class="slice" cx="${n(cx)}" cy="${n(cy)}" r="${n((outer + inner) / 2)}" fill="none" stroke="${theme.series[0]}" stroke-width="${n(outer - inner)}"/>`,
    );
  } else {
    let angle = -Math.PI / 2;
    data.forEach((slice, i) => {
      const sweep = (slice.value / total) * Math.PI * 2;
      const end = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const p = (radius, a) => `${n(cx + radius * Math.cos(a))} ${n(cy + radius * Math.sin(a))}`;
      parts.push(
        `<path class="slice" d="M ${p(outer, angle)} A ${n(outer)} ${n(outer)} 0 ${large} 1 ${p(outer, end)} L ${p(inner, end)} A ${n(inner)} ${n(inner)} 0 ${large} 0 ${p(inner, angle)} Z" fill="${theme.series[i % theme.series.length]}"/>`,
      );
      angle = end;
    });
  }

  if (donut && total > 0) {
    parts.push(text(formatValue(total), cx, cy + 6, {
      size: 18, fill: theme.fg, family: theme.fontFamily, anchor: "middle", weight: "700", className: "donut-total",
    }));
  }

  const legendX = box.x + box.w * 0.58;
  const legendTop = box.y + INSET + 16;
  data.forEach((slice, i) => {
    const y = legendTop + i * 22;
    if (y > box.y + box.h - INSET) return;
    const percent = total > 0 ? Math.round((slice.value / total) * 100) : 0;
    parts.push(`<rect x="${n(legendX)}" y="${n(y - 10)}" width="12" height="12" rx="2" fill="${theme.series[i % theme.series.length]}"/>`);
    parts.push(text(`${slice.label} ${percent}%`, legendX + 18, y, {
      size: 14, fill: theme.fg, family: theme.fontFamily, className: "legend-label",
    }));
  });

  return parts.join("\n");
}

function renderChartBlock(block, box, theme) {
  if (block.chart === "bar") return renderBarInBox(block, box, theme);
  if (block.chart === "line") return renderLineInBox(block, box, theme);
  if (block.chart === "pie") return renderRingInBox(block, box, theme, false);
  if (block.chart === "donut") return renderRingInBox(block, box, theme, true);
  return "";
}

function renderBlock(block, box, theme) {
  if (block.type === "image") return renderImageBlock(block, box);
  if (block.type === "text") return renderTextBlock(block, box, theme);
  if (block.type === "chart") return renderChartBlock(block, box, theme);
  return "";
}

/**
 * @param {{ title: string, layout?: "stack"|"split", blocks: object[] }} slide
 * @param {object} theme
 * @returns {string} SVG body fragment (no outer frame)
 */
export function renderComposite(slide, theme) {
  return placeBlocks(slide)
    .map(({ block, box }) => renderBlock(block, box, theme))
    .join("\n");
}
