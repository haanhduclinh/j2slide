import { CANVAS, CONTENT_TOP, CONTENT_BOTTOM, n, text } from "../draw.js";

/**
 * @param {{
 *   title: string,
 *   x_label?: string,
 *   y_label?: string,
 *   points: { x: number, y: number, label?: string, series?: string }[]
 * }} slide
 * @param {object} theme
 */
export function renderScatter(slide, theme) {
  const points = slide.points;
  const left = CANVAS.pad + 48;
  const right = CANVAS.w - CANVAS.pad - 40;
  const top = CONTENT_TOP + 40;
  const bottom = CONTENT_BOTTOM - 40;
  const width = right - left;
  const height = bottom - top;

  let minX = Math.min(...points.map((p) => p.x));
  let maxX = Math.max(...points.map((p) => p.x));
  let minY = Math.min(...points.map((p) => p.y));
  let maxY = Math.max(...points.map((p) => p.y));
  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  // 5% padding
  const padX = (maxX - minX) * 0.05;
  const padY = (maxY - minY) * 0.05;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const sx = (x) => left + ((x - minX) / (maxX - minX)) * width;
  const sy = (y) => bottom - ((y - minY) / (maxY - minY)) * height;

  const seriesOrder = [];
  points.forEach((p) => {
    const key = p.series ?? "";
    if (!seriesOrder.includes(key)) seriesOrder.push(key);
  });

  const colorFor = (p) => {
    const key = p.series ?? "";
    if (!key && seriesOrder.length === 1) return theme.accent;
    const idx = seriesOrder.indexOf(key);
    return theme.series[idx % theme.series.length];
  };

  const parts = [
    `<line x1="${left}" y1="${n(bottom)}" x2="${right}" y2="${n(bottom)}" stroke="${theme.grid}" stroke-width="2"/>`,
    `<line x1="${left}" y1="${n(top)}" x2="${left}" y2="${n(bottom)}" stroke="${theme.grid}" stroke-width="2"/>`,
  ];

  if (slide.x_label) {
    parts.push(text(slide.x_label, (left + right) / 2, bottom + 36, {
      size: theme.labelSize, fill: theme.muted, family: theme.fontFamily,
      anchor: "middle", className: "axis-label",
    }));
  }
  if (slide.y_label) {
    parts.push(text(slide.y_label, left - 12, top - 12, {
      size: theme.labelSize, fill: theme.muted, family: theme.fontFamily,
      className: "axis-label",
    }));
  }

  points.forEach((p) => {
    const cx = sx(p.x);
    const cy = sy(p.y);
    parts.push(
      `<circle class="scatter-point" cx="${n(cx)}" cy="${n(cy)}" r="10" fill="${colorFor(p)}"/>`,
    );
    if (p.label) {
      parts.push(text(p.label, cx + 14, cy + 6, {
        size: 18, fill: theme.fg, family: theme.fontFamily, className: "point-label",
      }));
    }
  });

  const namedSeries = seriesOrder.filter(Boolean);
  if (namedSeries.length > 1) {
    const legendX = right - 160;
    namedSeries.forEach((name, i) => {
      const y = top + i * 36;
      const color = theme.series[seriesOrder.indexOf(name) % theme.series.length];
      parts.push(`<circle cx="${legendX}" cy="${n(y)}" r="8" fill="${color}"/>`);
      parts.push(text(name, legendX + 16, y + 5, {
        size: 20, fill: theme.fg, family: theme.fontFamily, className: "legend-label",
      }));
    });
  }

  return parts.join("\n");
}
