import { CANVAS, CONTENT_TOP, CONTENT_BOTTOM, n, text, ellipsize } from "../draw.js";

/**
 * @param {{ title: string, columns: string[], rows: string[][] }} slide
 * @param {object} theme
 * @returns {string} SVG body fragment
 */
export function renderTable(slide, theme) {
  const cols = slide.columns.length;
  const rows = slide.rows;
  const left = CANVAS.pad;
  const width = CANVAS.w - CANVAS.pad * 2;
  const top = CONTENT_TOP + 16;
  const height = CONTENT_BOTTOM - top;
  const colW = width / cols;
  const rowCount = rows.length + 1; // header + body
  const rowH = Math.min(64, height / rowCount);
  const fontSize = rowH > 48 ? 26 : 20;
  const cellW = colW - 32;  // 16px padding each side

  const parts = [];

  // Header background
  parts.push(
    `<rect x="${left}" y="${n(top)}" width="${n(width)}" height="${n(rowH)}" fill="${theme.grid}" rx="8"/>`,
  );

  slide.columns.forEach((col, c) => {
    const x = left + colW * c + 16;
    const y = top + rowH * 0.65;
    parts.push(text(ellipsize(col, cellW, fontSize, "700"), x, y, {
      size: fontSize, fill: theme.fg, family: theme.fontFamily,
      weight: "700", className: "table-header",
    }));
  });

  rows.forEach((row, r) => {
    const y0 = top + rowH * (r + 1);
    if (r % 2 === 1) {
      parts.push(
        `<rect x="${left}" y="${n(y0)}" width="${n(width)}" height="${n(rowH)}" fill="${theme.grid}" opacity="0.35"/>`,
      );
    }
    row.forEach((cell, c) => {
      const x = left + colW * c + 16;
      const y = y0 + rowH * 0.65;
      parts.push(text(ellipsize(cell, cellW, fontSize, "400"), x, y, {
        size: fontSize, fill: theme.fg, family: theme.fontFamily, className: "table-cell",
      }));
    });
  });

  // Outer border
  parts.push(
    `<rect x="${left}" y="${n(top)}" width="${n(width)}" height="${n(rowH * rowCount)}" fill="none" stroke="${theme.grid}" stroke-width="2" rx="8"/>`,
  );

  return parts.join("\n");
}
