import {
  CANVAS, CONTENT_TOP, CONTENT_BOTTOM, ROTATE_LABELS_ABOVE, n, text,
} from "../draw.js";

/**
 * @param {{ title: string, unit?: string, categories: string[], series: { name: string, values: number[] }[] }} slide
 * @param {object} theme
 */
export function renderStackedBar(slide, theme) {
  const { categories, series, unit } = slide;
  const left = CANVAS.pad + 16;
  const right = CANVAS.w - CANVAS.pad - (series.length > 1 ? 200 : 0);
  const width = right - left;
  const baseline = CONTENT_BOTTOM - 60;
  const top = CONTENT_TOP + 40;
  const plotH = baseline - top;

  const stackTotals = categories.map((_, ci) =>
    series.reduce((sum, s) => sum + (s.values[ci] ?? 0), 0),
  );
  const max = Math.max(0, ...stackTotals) || 1;

  const slot = width / categories.length;
  const barWidth = Math.min(120, slot * 0.6);
  const rotate = categories.length > ROTATE_LABELS_ABOVE;

  const parts = [
    `<line x1="${left}" y1="${n(baseline)}" x2="${right}" y2="${n(baseline)}" stroke="${theme.grid}" stroke-width="2"/>`,
  ];

  categories.forEach((cat, ci) => {
    const centre = left + slot * (ci + 0.5);
    let y = baseline;
    series.forEach((s, si) => {
      const v = s.values[ci] ?? 0;
      const h = (v / max) * plotH;
      y -= h;
      const color = theme.series[si % theme.series.length];
      parts.push(
        `<rect class="stack-seg" x="${n(centre - barWidth / 2)}" y="${n(y)}" width="${n(barWidth)}" height="${n(Math.max(h, 0))}" fill="${color}"/>`,
      );
    });

    if (rotate) {
      parts.push(text(cat, centre, baseline + 28, {
        size: theme.labelSize, fill: theme.muted, family: theme.fontFamily,
        anchor: "end", transform: `rotate(-45 ${n(centre)} ${n(baseline + 28)})`, className: "cat-label",
      }));
    } else {
      parts.push(text(cat, centre, baseline + 36, {
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

  return parts.join("\n");
}
