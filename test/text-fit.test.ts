import { describe, it, expect } from "vitest";
import { renderSlide, CANVAS } from "../public/render.js";
import { measureText, CONTENT_TOP, CONTENT_BOTTOM } from "../public/draw.js";
import { THEMES } from "../public/theme.js";
import { L } from "../src/limits";

const dark = THEMES.dark;
const render = (slide: any) => renderSlide(slide, dark);

/** A long Vietnamese bullet of the kind that first exposed the overflow. */
const VN_BULLET =
  "Tăng trưởng reach dồn vào 16/08 (~465 reach) và 12/08 (~450 reach), tức phụ thuộc vài bài/ngày bùng lên.";
const VN_TITLE = "Phân tích HK Tower: không giảm reach, giảm chất lượng view";

type Line = { x: number; size: number; weight: string; content: string; cls: string; anchor: string };

/** Pull every drawn line of text out of an SVG, resolving tspan positions. */
function lines(svg: string): Line[] {
  const out: Line[] = [];
  const texts = svg.matchAll(/<text ([^>]*)>([\s\S]*?)<\/text>/g);
  for (const [, attrs, body] of texts) {
    const at = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(attrs)?.[1];
    const base = {
      x: Number(at("x") ?? 0),
      size: Number(at("font-size") ?? 24),
      weight: at("font-weight") ?? "400",
      cls: at("class") ?? "",
      anchor: at("text-anchor") ?? "start",
    };
    const spans = [...body.matchAll(/<tspan ([^>]*)>([\s\S]*?)<\/tspan>/g)];
    if (spans.length === 0) {
      out.push({ ...base, content: body });
      continue;
    }
    for (const [, spanAttrs, spanBody] of spans) {
      const sx = /x="([^"]*)"/.exec(spanAttrs)?.[1];
      out.push({ ...base, x: sx === undefined ? base.x : Number(sx), content: spanBody });
    }
  }
  return out;
}

const widthOf = (l: Line) => measureText(l.content, l.size, l.weight);

/** Left edge of a run, resolving text-anchor. */
const leftOf = (l: Line) =>
  l.anchor === "middle" ? l.x - widthOf(l) / 2
  : l.anchor === "end" ? l.x - widthOf(l)
  : l.x;

describe("text metrics", () => {
  it("scales linearly with font size", () => {
    expect(measureText("hello", 40, "400")).toBeCloseTo(measureText("hello", 20, "400") * 2, 5);
  });

  it("makes bold wider than regular", () => {
    expect(measureText("hello", 40, "700")).toBeGreaterThan(measureText("hello", 40, "400"));
  });

  it("measures an empty string as zero and never returns NaN", () => {
    expect(measureText("", 40, "400")).toBe(0);
    expect(Number.isFinite(measureText(VN_BULLET, 28, "400"))).toBe(true);
  });

  it("does not charge extra width for Vietnamese tone marks", () => {
    // Diacritics sit above the glyph; they must not inflate the advance width.
    expect(measureText("ăâđêôơư", 40, "400")).toBeLessThan(measureText("mmmmmmm", 40, "400"));
  });
});

describe("no text overflows the canvas", () => {
  const slides: any[] = [
    { type: "composite", title: VN_TITLE, layout: "split", blocks: [
      { type: "text", bullets: Array.from({ length: L.COMPOSITE_TEXT_BULLETS_MAX }, () => VN_BULLET) },
      { type: "chart", chart: "bar", data: [{ label: "Reach W1", value: 1240 }, { label: "View W2", value: 1994 }] },
    ]},
    { type: "text", title: VN_TITLE, bullets: Array.from({ length: L.BULLETS_MAX }, () => VN_BULLET) },
    { type: "text", title: "T", bullets: [ "b".repeat(L.BULLET_MAX) ] },
    { type: "table", title: "T",
      columns: Array.from({ length: L.TABLE_COLS_MAX }, () => "H".repeat(L.TABLE_CELL_MAX)),
      rows: [Array.from({ length: L.TABLE_COLS_MAX }, () => "W".repeat(L.TABLE_CELL_MAX))] },
    { type: "pie", title: "T",
      data: Array.from({ length: L.PIE_MAX }, () => ({ label: "M".repeat(L.LABEL_MAX), value: 1 })) },
    { type: "kpi", title: "T",
      items: Array.from({ length: L.KPI_MAX }, () => ({ label: "M".repeat(L.LABEL_MAX), value: "8".repeat(L.KPI_VALUE_MAX) })) },
  ];

  for (const slide of slides) {
    it(`keeps every glyph inside 0..${CANVAS.w} for ${slide.type}`, () => {
      for (const l of lines(render(slide))) {
        const right = leftOf(l) + widthOf(l);
        expect.soft(right, `"${l.content.slice(0, 40)}" (${l.cls}) runs past the canvas`)
          .toBeLessThanOrEqual(CANVAS.w - CANVAS.pad + 1);
      }
    });
  }
});

describe("composite split columns", () => {
  const slide = {
    type: "composite", title: VN_TITLE, layout: "split",
    blocks: [
      { type: "text", bullets: [VN_BULLET, VN_BULLET, VN_BULLET] },
      { type: "chart", chart: "bar", data: [{ label: "Reach W1", value: 1240 }, { label: "View W2", value: 1994 }] },
    ],
  };

  it("keeps bullet text out of the chart column", () => {
    // Left column ends at pad + (content width - gutter) / 2.
    const colRight = CANVAS.pad + (CANVAS.w - CANVAS.pad * 2 - 24) / 2;
    const bullets = lines(render(slide)).filter((l) => l.cls === "bullet");
    expect(bullets.length).toBeGreaterThan(0);
    for (const l of bullets) {
      expect.soft(l.x + widthOf(l), `bullet "${l.content.slice(0, 40)}" overlaps the chart`)
        .toBeLessThanOrEqual(colRight);
    }
  });

  it("keeps bullet text inside the vertical content band", () => {
    const svg = render(slide);
    const ys = [...svg.matchAll(/<(?:text|tspan)[^>]*\sy="([\d.]+)"/g)].map((m) => Number(m[1]));
    for (const y of ys.filter((y) => y > CONTENT_TOP - 60)) {
      expect.soft(y).toBeLessThanOrEqual(CONTENT_BOTTOM);
    }
  });
});

describe("titles", () => {
  it("shrinks a long title instead of running off the slide", () => {
    const svg = render({ type: "text", title: VN_TITLE, bullets: ["x"] });
    const title = lines(svg).find((l) => l.cls === "slide-title")!;
    expect(leftOf(title) + widthOf(title)).toBeLessThanOrEqual(CANVAS.w - CANVAS.pad + 1);
  });

  it("leaves a short title at full size", () => {
    const svg = render({ type: "text", title: "Revenue", bullets: ["x"] });
    const title = lines(svg).find((l) => l.cls === "slide-title")!;
    expect(title.size).toBe(dark.titleSize);
  });

  it("still fits a title of the maximum allowed length", () => {
    const svg = render({ type: "text", title: "M".repeat(L.TITLE_MAX), bullets: ["x"] });
    const title = lines(svg).find((l) => l.cls === "slide-title")!;
    expect(leftOf(title) + widthOf(title)).toBeLessThanOrEqual(CANVAS.w - CANVAS.pad + 1);
  });
});
