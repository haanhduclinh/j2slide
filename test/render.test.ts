import { describe, it, expect } from "vitest";
import { renderSlide } from "../public/render.js";
import { THEMES } from "../public/theme.js";
import { L } from "../src/limits";

const dark = THEMES.dark;
const render = (slide: any) => renderSlide(slide, dark);

describe("renderSlide", () => {
  it("produces a 1600x900 svg for every slide type", () => {
    const slides = [
      { type: "bar", title: "T", data: [{ label: "a", value: 1 }] },
      { type: "line", title: "T", data: [{ label: "a", value: 1 }] },
      { type: "pie", title: "T", data: [{ label: "a", value: 1 }] },
      { type: "text", title: "T", bullets: ["b"] },
      { type: "kpi", title: "T", items: [{ label: "a", value: "1" }] },
      { type: "table", title: "T", columns: ["A"], rows: [["1"]] },
      {
        type: "area", title: "T",
        categories: ["Q1", "Q2"],
        series: [{ name: "A", values: [1, 2] }],
      },
      {
        type: "stacked_bar", title: "T",
        categories: ["Q1"],
        series: [{ name: "A", values: [1] }],
      },
      { type: "scatter", title: "T", points: [{ x: 1, y: 2 }] },
      { type: "donut", title: "T", data: [{ label: "a", value: 1 }] },
      {
        type: "composite",
        title: "T",
        blocks: [{ type: "text", bullets: ["b"] }],
      },
    ];
    for (const slide of slides) {
      const svg = render(slide);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain('viewBox="0 0 1600 900"');
      expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    }
  });

  it("renders the title on every slide type", () => {
    expect(render({ type: "bar", title: "Revenue", data: [{ label: "a", value: 1 }] })).toContain("Revenue");
    expect(render({ type: "text", title: "Findings", bullets: ["x"] })).toContain("Findings");
  });

  it("escapes xml special characters in user text", () => {
    const svg = render({ type: "text", title: `A & B <script>`, bullets: [`"quoted" & 'single'`] });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&lt;");
  });

  it("draws one bar rect per data point", () => {
    const data = Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, value: i + 1 }));
    const svg = render({ type: "bar", title: "T", data });
    expect(svg.match(/class="bar"/g)).toHaveLength(5);
  });

  it("handles a single bar without dividing by zero", () => {
    const svg = render({ type: "bar", title: "T", data: [{ label: "only", value: 7 }] });
    expect(svg).not.toContain("NaN");
    expect(svg).toContain("only");
  });

  it("handles bars that are all zero", () => {
    const svg = render({ type: "bar", title: "T", data: [{ label: "a", value: 0 }, { label: "b", value: 0 }] });
    expect(svg).not.toContain("NaN");
  });

  it("handles negative bar values", () => {
    const svg = render({ type: "bar", title: "T", data: [{ label: "a", value: -5 }, { label: "b", value: 10 }] });
    expect(svg).not.toContain("NaN");
  });

  it("appends the unit to bar value labels when given", () => {
    const svg = render({ type: "bar", title: "T", unit: "M USD", data: [{ label: "a", value: 3 }] });
    expect(svg).toContain("M USD");
  });

  it("rotates category labels once past the crowding threshold", () => {
    const few = render({ type: "bar", title: "T", data: Array.from({ length: 8 }, (_, i) => ({ label: `L${i}`, value: 1 })) });
    const many = render({ type: "bar", title: "T", data: Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: 1 })) });
    expect(few).not.toContain("rotate(-45");
    expect(many).toContain("rotate(-45");
  });

  it("draws a polyline with one point per datum for line charts", () => {
    const data = Array.from({ length: 4 }, (_, i) => ({ label: `L${i}`, value: i }));
    const svg = render({ type: "line", title: "T", data });
    expect(svg.match(/class="point"/g)).toHaveLength(4);
    expect(svg).toContain("<polyline");
  });

  it("computes pie percentages that sum to 100", () => {
    const svg = render({ type: "pie", title: "T", data: [{ label: "a", value: 1 }, { label: "b", value: 3 }] });
    expect(svg).toContain("25%");
    expect(svg).toContain("75%");
  });

  it("renders a full circle for a single pie slice", () => {
    const svg = render({ type: "pie", title: "T", data: [{ label: "only", value: 5 }] });
    expect(svg).not.toContain("NaN");
    expect(svg).toContain("100%");
  });

  it("does not divide by zero when every pie value is zero", () => {
    const svg = render({ type: "pie", title: "T", data: [{ label: "a", value: 0 }, { label: "b", value: 0 }] });
    expect(svg).not.toContain("NaN");
  });

  it("renders one line per bullet", () => {
    const svg = render({ type: "text", title: "T", bullets: ["one", "two", "three"] });
    expect(svg.match(/class="bullet"/g)).toHaveLength(3);
  });

  it("shrinks bullet text as the list grows", () => {
    const size = (n: number) => {
      const svg = render({ type: "text", title: "T", bullets: Array.from({ length: n }, (_, i) => `b${i}`) });
      return Number(/class="bullet"[^>]*font-size="(\d+(?:\.\d+)?)"/.exec(svg)![1]);
    };
    expect(size(L.BULLETS_MAX)).toBeLessThan(size(2));
  });

  it("renders one tile per kpi item with its delta", () => {
    const svg = render({
      type: "kpi", title: "T",
      items: [
        { label: "Revenue", value: "12.4M", delta: "34%", trend: "up" },
        { label: "Churn", value: "2.1%", delta: "3%", trend: "down" },
      ],
    });
    expect(svg.match(/class="kpi-tile"/g)).toHaveLength(2);
    expect(svg).toContain("34%");
    expect(svg).toContain("▲");
    expect(svg).toContain("▼");
  });

  it("omits the delta row when no delta is given", () => {
    const svg = render({ type: "kpi", title: "T", items: [{ label: "Revenue", value: "12.4M" }] });
    expect(svg).not.toContain("▲");
    expect(svg).not.toContain("▼");
  });

  it("renders every slide type at its maximum size without producing NaN", () => {
    const maxed = [
      { type: "bar", title: "t".repeat(L.TITLE_MAX), unit: "u".repeat(L.UNIT_MAX),
        data: Array.from({ length: L.SERIES_MAX }, (_, i) => ({ label: "l".repeat(L.LABEL_MAX), value: i })) },
      { type: "pie", title: "T",
        data: Array.from({ length: L.PIE_MAX }, (_, i) => ({ label: "l".repeat(L.LABEL_MAX), value: i + 1 })) },
      { type: "text", title: "T", bullets: Array.from({ length: L.BULLETS_MAX }, () => "b".repeat(L.BULLET_MAX)) },
      { type: "kpi", title: "T",
        items: Array.from({ length: L.KPI_MAX }, () => ({ label: "l".repeat(L.LABEL_MAX), value: "v".repeat(L.KPI_VALUE_MAX), delta: "d".repeat(L.KPI_DELTA_MAX), trend: "up" })) },
      {
        type: "table", title: "T",
        columns: Array.from({ length: L.TABLE_COLS_MAX }, (_, i) => `C${i}`),
        rows: Array.from({ length: L.TABLE_ROWS_MAX }, () =>
          Array.from({ length: L.TABLE_COLS_MAX }, () => "x".repeat(L.TABLE_CELL_MAX))),
      },
      {
        type: "area", title: "T",
        categories: Array.from({ length: L.CATEGORIES_MAX }, (_, i) => `Q${i}`),
        series: Array.from({ length: L.MULTI_SERIES_MAX }, (_, s) => ({
          name: `S${s}`,
          values: Array.from({ length: L.CATEGORIES_MAX }, (_, i) => i + s),
        })),
      },
      {
        type: "stacked_bar", title: "T",
        categories: Array.from({ length: L.CATEGORIES_MAX }, (_, i) => `Q${i}`),
        series: Array.from({ length: L.MULTI_SERIES_MAX }, (_, s) => ({
          name: `S${s}`,
          values: Array.from({ length: L.CATEGORIES_MAX }, () => 1),
        })),
      },
      {
        type: "scatter", title: "T",
        points: Array.from({ length: L.SCATTER_MAX }, (_, i) => ({ x: i, y: i % 7, series: `G${i % 3}` })),
      },
      {
        type: "donut", title: "T",
        data: Array.from({ length: L.PIE_MAX }, (_, i) => ({ label: `L${i}`, value: i + 1 })),
      },
    ];
    for (const slide of maxed) {
      const svg = render(slide);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("undefined");
    }
  });

  it("renders table cells", () => {
    const svg = render({
      type: "table", title: "T",
      columns: ["A", "B"],
      rows: [["1", "2"]],
    });
    expect(svg).toContain('class="table-cell"');
    expect(svg).toContain("1");
  });

  it("renders stacked bar segments", () => {
    const svg = render({
      type: "stacked_bar", title: "T",
      categories: ["Q1"],
      series: [
        { name: "A", values: [1] },
        { name: "B", values: [2] },
      ],
    });
    expect(svg.match(/class="stack-seg"/g)).toHaveLength(2);
  });

  it("renders area series path", () => {
    const svg = render({
      type: "area", title: "T",
      categories: ["Q1", "Q2"],
      series: [{ name: "A", values: [1, 3] }],
    });
    expect(svg).toContain('class="area-series"');
    expect(svg).not.toContain("NaN");
  });

  it("renders scatter points", () => {
    const svg = render({
      type: "scatter", title: "T",
      points: [{ x: 1, y: 2 }, { x: 3, y: 4, series: "S" }],
    });
    expect(svg.match(/class="scatter-point"/g)).toHaveLength(2);
  });

  it("renders donut slices and center total", () => {
    const svg = render({
      type: "donut", title: "T",
      data: [{ label: "a", value: 1 }, { label: "b", value: 3 }],
    });
    expect(svg.match(/class="slice"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(svg).toContain('class="donut-center"');
    expect(svg).toContain("4");
  });

  it("renders composite with image href, bullets, and bar marks", () => {
    const svg = render({
      type: "composite",
      title: "Combo",
      layout: "stack",
      blocks: [
        { type: "image", url: "https://cdn.example.com/a.png" },
        { type: "text", bullets: ["alpha", "beta"] },
        { type: "chart", chart: "bar", data: [{ label: "Q1", value: 3 }] },
      ],
    });
    expect(svg).toContain('class="block-image"');
    expect(svg).toContain("https://cdn.example.com/a.png");
    expect(svg).toContain("alpha");
    expect(svg).toMatch(/class="bar"/);
  });

  it("renders composite split without throwing for two blocks", () => {
    const svg = render({
      type: "composite",
      title: "Split",
      layout: "split",
      blocks: [
        { type: "text", bullets: ["left"] },
        { type: "chart", chart: "line", data: [{ label: "a", value: 1 }, { label: "b", value: 2 }] },
      ],
    });
    expect(svg).toContain("left");
    expect(svg).toContain("polyline");
  });

  it("escapes image url xml specials", () => {
    const svg = render({
      type: "composite",
      title: "T",
      blocks: [{ type: "image", url: "https://cdn.example.com/a&b.png?x=1&y=2" }],
    });
    expect(svg).toContain("a&amp;b.png");
  });

  it("renders nested pie and donut chart blocks", () => {
    const pie = render({
      type: "composite",
      title: "Pie combo",
      blocks: [
        { type: "text", bullets: ["share"] },
        { type: "chart", chart: "pie", data: [{ label: "a", value: 1 }, { label: "b", value: 2 }] },
      ],
    });
    expect(pie).toContain("share");
    expect(pie.match(/class="slice"/g)?.length).toBeGreaterThanOrEqual(1);

    const donut = render({
      type: "composite",
      title: "Donut combo",
      blocks: [
        { type: "chart", chart: "donut", data: [{ label: "a", value: 1 }, { label: "b", value: 3 }] },
      ],
    });
    expect(donut.match(/class="slice"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(donut).toContain('class="donut-total"');
    expect(donut).toContain("4");
  });

  it("renders a three-block split without NaN", () => {
    const svg = render({
      type: "composite",
      title: "Split3",
      layout: "split",
      blocks: [
        { type: "image", url: "https://cdn.example.com/a.png" },
        { type: "text", bullets: ["one", "two"] },
        { type: "chart", chart: "bar", data: [{ label: "Q1", value: 2 }, { label: "Q2", value: 5 }] },
      ],
    });
    expect(svg).toContain('class="block-image"');
    expect(svg).toContain("one");
    expect(svg).toMatch(/class="bar"/);
    expect(svg).not.toContain("NaN");
  });

  it("renders composite in both themes without NaN", () => {
    const slide = {
      type: "composite",
      title: "Themes",
      layout: "stack",
      blocks: [
        { type: "image", url: "https://cdn.example.com/a.png" },
        { type: "text", bullets: ["hello"] },
        { type: "chart", chart: "line", data: [{ label: "a", value: 1 }, { label: "b", value: 3 }] },
      ],
    };
    const dark = renderSlide(slide, THEMES.dark);
    const light = renderSlide(slide, THEMES.light);
    expect(dark).toContain(THEMES.dark.fg);
    expect(light).toContain(THEMES.light.fg);
    expect(dark).not.toContain("NaN");
    expect(light).not.toContain("NaN");
    expect(dark).toContain("hello");
    expect(light).toContain("hello");
  });

  it("renders in both themes", () => {
    const slide = { type: "bar", title: "T", data: [{ label: "a", value: 1 }] };
    expect(renderSlide(slide, THEMES.dark)).toContain(THEMES.dark.fg);
    expect(renderSlide(slide, THEMES.light)).toContain(THEMES.light.fg);
  });
});
