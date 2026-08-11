import {
  CANVAS, CONTENT_TOP, CONTENT_BOTTOM, ROTATE_LABELS_ABOVE, labelIndices, n, text, formatValue,
} from "../draw.js";

/**
 * Multi-series overlaid area chart (each series filled under its line).
 * @param {{ title: string, unit?: string, categories: string[], series: { name: string, values: number[] }[] }} slide
 * @param {object} theme
 */
export function renderArea(slide, theme) {
  const { categories, series, unit } = slide;
  const left = CANVAS.pad + 16;
  const right = CANVAS.w - CANVAS.pad - (series.length > 1 ? 200 : 0);
  const width = right - left;
  const baseline = CONTENT_BOTTOM - 60;
  const top = CONTENT_TOP + 40;

  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(0, ...allValues);
  const min = Math.min(0, ...allValues);
  const span = max - min || 1;
  const zeroY = baseline - ((0 - min) / span) * (baseline - top);

  const xAt = (i) => {
    if (categories.length === 1) return left + width / 2;
    return left + (width * i) / (categories.length - 1);
  };
  const yAt = (v) => baseline - ((v - min) / span) * (baseline - top);

  const parts = [
    `<line x1="${left}" y1="${n(zeroY)}" x2="${right}" y2="${n(zeroY)}" stroke="${theme.grid}" stroke-width="2"/>`,
  ];

  series.forEach((s, si) => {
    const color = theme.series[si % theme.series.length];
    const pts = s.values.map((v, i) => `${n(xAt(i))},${n(yAt(v))}`);
    const first = `${n(xAt(0))},${n(zeroY)}`;
    const last = `${n(xAt(s.values.length - 1))},${n(zeroY)}`;
    const areaPts = [first, ...pts, last].join(" ");
    parts.push(
      `<polygon class="area-series" points="${areaPts}" fill="${color}" fill-opacity="0.28" stroke="none"/>`,
    );
    parts.push(
      `<polyline class="area-line" points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="3"/>`,
    );
  });

  const rotate = categories.length > ROTATE_LABELS_ABOVE;
  const labeled = new Set(labelIndices(categories.length));
  categories.forEach((cat, i) => {
    if (!labeled.has(i)) return;
    const x = xAt(i);
    if (rotate) {
      parts.push(text(cat, x, baseline + 28, {
        size: theme.labelSize, fill: theme.muted, family: theme.fontFamily,
        anchor: "end", transform: `rotate(-45 ${n(x)} ${n(baseline + 28)})`, className: "cat-label",
      }));
    } else {
      parts.push(text(cat, x, baseline + 36, {
        size: theme.labelSize, fill: theme.muted, family: theme.fontFamily,
        anchor: "middle", className: "cat-label",
      }));
    }
  });

  if (series.length > 1) {
    const legendX = right + 24;
    series.forEach((s, si) => {
      const y = top + si * 40;
      const color = theme.series[si % theme.series.length];
      parts.push(`<rect x="${legendX}" y="${n(y - 14)}" width="20" height="20" rx="4" fill="${color}"/>`);
      parts.push(text(s.name, legendX + 28, y, {
        size: 22, fill: theme.fg, family: theme.fontFamily, className: "legend-label",
      }));
    });
  }

  if (unit) {
    parts.push(text(unit, left, top - 12, {
      size: theme.footerSize, fill: theme.muted, family: theme.fontFamily,
    }));
  }

  // Touch formatValue so unit-only paths stay consistent if we label peaks later
  void formatValue;

  return parts.join("\n");
}
