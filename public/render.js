/**
 * Pure slide renderers. Every function takes data and returns an SVG string —
 * no DOM, no globals, no side effects. That is what makes them testable.
 */

import {
  CANVAS,
  TITLE_Y,
  RULE_Y,
  CONTENT_TOP,
  CONTENT_BOTTOM,
  FOOTER_Y,
  ROTATE_LABELS_ABOVE,
  HIDE_POINT_VALUES_ABOVE,
  labelIndices,
  n,
  text,
  formatValue,
} from "./draw.js";
import { renderTable } from "./renderers/table.js";
import { renderArea } from "./renderers/area.js";
import { renderStackedBar } from "./renderers/stacked-bar.js";
import { renderScatter } from "./renderers/scatter.js";
import { renderDonut } from "./renderers/donut.js";

export { CANVAS };

function frame(slide, theme, body, footer) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" width="100%" height="100%">`,
    `<rect x="0" y="0" width="${CANVAS.w}" height="${CANVAS.h}" fill="${theme.bg}"/>`,
    text(slide.title, CANVAS.pad, TITLE_Y, {
      size: theme.titleSize, fill: theme.fg, family: theme.fontFamily,
      weight: "700", className: "slide-title",
    }),
    `<rect x="${CANVAS.pad}" y="${RULE_Y}" width="96" height="4" fill="${theme.accent}"/>`,
    body,
    footer ?? "",
    `</svg>`,
  ].join("\n");
}

function footerText(theme, left, right) {
  return [
    text(left, CANVAS.pad, FOOTER_Y, {
      size: theme.footerSize, fill: theme.muted, family: theme.fontFamily, className: "footer-left",
    }),
    text(right, CANVAS.w - CANVAS.pad, FOOTER_Y, {
      size: theme.footerSize, fill: theme.muted, family: theme.fontFamily,
      anchor: "end", className: "footer-right",
    }),
  ].join("\n");
}

function renderBar(slide, theme) {
  const data = slide.data;
  const left = CANVAS.pad + 16;
  const right = CANVAS.w - CANVAS.pad;
  const width = right - left;
  const baseline = CONTENT_BOTTOM - 60;
  const top = CONTENT_TOP + 40;

  const values = data.map((d) => d.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const zeroY = baseline - ((0 - min) / span) * (baseline - top);

  const slot = width / data.length;
  const barWidth = Math.min(120, slot * 0.6);
  const rotate = data.length > ROTATE_LABELS_ABOVE;
  const showValues = data.length <= HIDE_POINT_VALUES_ABOVE;
  const labeled = new Set(labelIndices(data.length));

  const parts = [`<line x1="${left}" y1="${n(zeroY)}" x2="${right}" y2="${n(zeroY)}" stroke="${theme.grid}" stroke-width="2"/>`];

  data.forEach((point, i) => {
    const centre = left + slot * (i + 0.5);
    const valueY = baseline - ((point.value - min) / span) * (baseline - top);
    const y = Math.min(zeroY, valueY);
    const height = Math.abs(zeroY - valueY);
    const colour = theme.series[i % theme.series.length];

    parts.push(
      `<rect class="bar" x="${n(centre - barWidth / 2)}" y="${n(y)}" width="${n(barWidth)}" height="${n(height)}" rx="6" fill="${colour}"/>`,
    );
    if (showValues) {
      parts.push(text(formatValue(point.value, slide.unit), centre, y - 14, {
        size: theme.valueSize, fill: theme.fg, family: theme.fontFamily, anchor: "middle", className: "bar-value",
      }));
    }
    if (labeled.has(i)) {
      parts.push(text(point.label, centre, baseline + 40, {
        size: theme.labelSize, fill: theme.muted, family: theme.fontFamily,
        anchor: rotate ? "end" : "middle", className: "bar-label",
        transform: rotate ? `rotate(-45 ${n(centre)} ${n(baseline + 40)})` : undefined,
      }));
    }
  });

  return parts.join("\n");
}

function renderLine(slide, theme) {
  const data = slide.data;
  const left = CANVAS.pad + 80;
  const right = CANVAS.w - CANVAS.pad;
  const baseline = CONTENT_BOTTOM - 60;
  const top = CONTENT_TOP + 40;

  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = data.length > 1 ? (right - left) / (data.length - 1) : 0;
  const at = (i, value) => ({
    x: data.length > 1 ? left + step * i : (left + right) / 2,
    y: baseline - ((value - min) / span) * (baseline - top),
  });

  const parts = [];
  for (const fraction of [0, 0.5, 1]) {
    const y = baseline - fraction * (baseline - top);
    parts.push(`<line x1="${left}" y1="${n(y)}" x2="${right}" y2="${n(y)}" stroke="${theme.grid}" stroke-width="2"/>`);
    parts.push(text(formatValue(min + fraction * span, slide.unit), left - 16, y + 8, {
      size: theme.labelSize, fill: theme.muted, family: theme.fontFamily, anchor: "end", className: "axis-label",
    }));
  }

  const points = data.map((d, i) => at(i, d.value));
  parts.push(
    `<polyline fill="none" stroke="${theme.series[0]}" stroke-width="5" stroke-linejoin="round" points="${points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ")}"/>`,
  );

  const labeled = new Set(labelIndices(data.length));
  const pointR = data.length > HIDE_POINT_VALUES_ABOVE ? 4 : 8;
  points.forEach((p, i) => {
    parts.push(`<circle class="point" cx="${n(p.x)}" cy="${n(p.y)}" r="${pointR}" fill="${theme.series[0]}"/>`);
    if (labeled.has(i)) {
      parts.push(text(data[i].label, p.x, baseline + 40, {
        size: theme.labelSize, fill: theme.muted, family: theme.fontFamily,
        anchor: data.length > ROTATE_LABELS_ABOVE ? "end" : "middle", className: "line-label",
        transform: data.length > ROTATE_LABELS_ABOVE ? `rotate(-45 ${n(p.x)} ${n(baseline + 40)})` : undefined,
      }));
    }
  });

  return parts.join("\n");
}

function renderPie(slide, theme) {
  const data = slide.data;
  const cx = 480;
  const cy = (CONTENT_TOP + CONTENT_BOTTOM) / 2;
  const outer = 240;
  const inner = 130;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const parts = [];

  if (total <= 0) {
    // Nothing to divide: draw an empty ring rather than emitting NaN paths.
    parts.push(`<circle cx="${cx}" cy="${n(cy)}" r="${outer}" fill="none" stroke="${theme.grid}" stroke-width="${outer - inner}"/>`);
  } else if (data.length === 1) {
    parts.push(`<circle class="slice" cx="${cx}" cy="${n(cy)}" r="${(outer + inner) / 2}" fill="none" stroke="${theme.series[0]}" stroke-width="${outer - inner}"/>`);
  } else {
    let angle = -Math.PI / 2;
    data.forEach((slice, i) => {
      const sweep = (slice.value / total) * Math.PI * 2;
      const end = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const p = (radius, a) => `${n(cx + radius * Math.cos(a))} ${n(cy + radius * Math.sin(a))}`;

      parts.push(
        `<path class="slice" d="M ${p(outer, angle)} A ${outer} ${outer} 0 ${large} 1 ${p(outer, end)} L ${p(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${p(inner, angle)} Z" fill="${theme.series[i % theme.series.length]}"/>`,
      );
      angle = end;
    });
  }

  const legendX = 860;
  const legendTop = cy - (data.length * 56) / 2 + 28;
  data.forEach((slice, i) => {
    const y = legendTop + i * 56;
    const percent = total > 0 ? Math.round((slice.value / total) * 100) : 0;
    parts.push(`<rect x="${legendX}" y="${n(y - 18)}" width="24" height="24" rx="5" fill="${theme.series[i % theme.series.length]}"/>`);
    parts.push(text(slice.label, legendX + 40, y, {
      size: 28, fill: theme.fg, family: theme.fontFamily, className: "legend-label",
    }));
    parts.push(text(`${formatValue(slice.value)} · ${percent}%`, CANVAS.w - CANVAS.pad, y, {
      size: 28, fill: theme.muted, family: theme.fontFamily, anchor: "end", className: "legend-value",
    }));
  });

  return parts.join("\n");
}

function renderText(slide, theme) {
  const count = slide.bullets.length;
  // Interpolate down from the max size as the list fills up.
  const size = count <= 1
    ? theme.bulletMaxSize
    : theme.bulletMaxSize - ((theme.bulletMaxSize - theme.bulletMinSize) * (count - 1)) / 7;
  const gap = (CONTENT_BOTTOM - CONTENT_TOP) / (count + 1);

  return slide.bullets.map((bullet, i) => {
    const y = CONTENT_TOP + gap * (i + 1);
    return [
      `<circle cx="${CANVAS.pad + 12}" cy="${n(y - 10)}" r="7" fill="${theme.accent}"/>`,
      text(bullet, CANVAS.pad + 44, y, {
        size: n(size), fill: theme.fg, family: theme.fontFamily, className: "bullet",
      }),
    ].join("\n");
  }).join("\n");
}

function renderKpi(slide, theme) {
  const items = slide.items;
  const left = CANVAS.pad;
  const width = CANVAS.w - CANVAS.pad * 2;
  const gap = 32;
  const tileWidth = (width - gap * (items.length - 1)) / items.length;
  const tileTop = CONTENT_TOP + 40;
  const tileHeight = 400;

  return items.map((item, i) => {
    const x = left + (tileWidth + gap) * i;
    const centre = x + tileWidth / 2;
    const arrow = item.trend === "up" ? "▲" : item.trend === "down" ? "▼" : "";
    const colour = item.trend === "up" ? theme.up : item.trend === "down" ? theme.down : theme.muted;

    const parts = [
      `<rect class="kpi-tile" x="${n(x)}" y="${tileTop}" width="${n(tileWidth)}" height="${tileHeight}" rx="18" fill="${theme.grid}"/>`,
      text(item.value, centre, tileTop + 200, {
        size: theme.kpiValueSize, fill: theme.fg, family: theme.fontFamily,
        weight: "700", anchor: "middle", className: "kpi-value",
      }),
      text(item.label, centre, tileTop + 264, {
        size: 28, fill: theme.muted, family: theme.fontFamily, anchor: "middle", className: "kpi-label",
      }),
    ];

    if (item.delta) {
      parts.push(text(`${arrow} ${item.delta}`.trim(), centre, tileTop + 330, {
        size: 32, fill: colour, family: theme.fontFamily, anchor: "middle", className: "kpi-delta",
      }));
    }

    return parts.join("\n");
  }).join("\n");
}

const RENDERERS = {
  bar: renderBar,
  line: renderLine,
  pie: renderPie,
  text: renderText,
  kpi: renderKpi,
  table: renderTable,
  area: renderArea,
  stacked_bar: renderStackedBar,
  scatter: renderScatter,
  donut: renderDonut,
};

/**
 * @param {object} slide  a validated slide
 * @param {object} theme  one of THEMES.dark / THEMES.light
 * @param {object} [position] optional `{ index, total, live }` for the footer
 * @returns {string} a complete SVG document
 */
export function renderSlide(slide, theme, position) {
  const renderer = RENDERERS[slide.type];
  if (!renderer) {
    return frame({ title: "Unsupported slide" }, theme, text(
      `No renderer for type "${slide.type}"`, CANVAS.pad, 420,
      { size: 32, fill: theme.muted, family: theme.fontFamily },
    ), "");
  }

  const footer = position
    ? footerText(theme, position.live ? "● live" : "○ reconnecting", `${position.index + 1} / ${position.total}`)
    : "";

  return frame(slide, theme, renderer(slide, theme), footer);
}

/** Shown before the first slide arrives, so a presenter can confirm the link. */
export function renderStandby(deckId, theme) {
  return frame({ title: "Waiting for the first slide" }, theme, [
    text(`Deck ${deckId}`, CANVAS.pad, 340, {
      size: 32, fill: theme.muted, family: theme.fontFamily, className: "standby-deck",
    }),
    text("Slides pushed to this deck will appear here immediately.", CANVAS.pad, 400, {
      size: 28, fill: theme.muted, family: theme.fontFamily,
    }),
  ].join("\n"), "");
}
