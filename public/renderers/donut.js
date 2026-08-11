import { CANVAS, CONTENT_TOP, CONTENT_BOTTOM, n, text, formatValue } from "../draw.js";

/**
 * Donut chart: ring slices + center total.
 * @param {{ title: string, data: { label: string, value: number }[] }} slide
 * @param {object} theme
 */
export function renderDonut(slide, theme) {
  const data = slide.data;
  const cx = 480;
  const cy = (CONTENT_TOP + CONTENT_BOTTOM) / 2;
  const outer = 240;
  const inner = 120;

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const parts = [];

  if (total <= 0) {
    parts.push(
      `<circle cx="${cx}" cy="${n(cy)}" r="${(outer + inner) / 2}" fill="none" stroke="${theme.grid}" stroke-width="${outer - inner}"/>`,
    );
  } else if (data.length === 1) {
    parts.push(
      `<circle class="slice" cx="${cx}" cy="${n(cy)}" r="${(outer + inner) / 2}" fill="none" stroke="${theme.series[0]}" stroke-width="${outer - inner}"/>`,
    );
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

  parts.push(text(formatValue(total), cx, cy + 8, {
    size: 40, fill: theme.fg, family: theme.fontFamily,
    weight: "700", anchor: "middle", className: "donut-center",
  }));

  const legendX = 860;
  const legendTop = cy - (data.length * 56) / 2 + 28;
  data.forEach((slice, i) => {
    const y = legendTop + i * 56;
    const percent = total > 0 ? Math.round((slice.value / total) * 100) : 0;
    parts.push(
      `<rect x="${legendX}" y="${n(y - 18)}" width="24" height="24" rx="5" fill="${theme.series[i % theme.series.length]}"/>`,
    );
    parts.push(text(slice.label, legendX + 40, y, {
      size: 28, fill: theme.fg, family: theme.fontFamily, className: "legend-label",
    }));
    parts.push(text(`${formatValue(slice.value)} · ${percent}%`, CANVAS.w - CANVAS.pad, y, {
      size: 28, fill: theme.muted, family: theme.fontFamily, anchor: "end", className: "legend-value",
    }));
  });

  return parts.join("\n");
}
