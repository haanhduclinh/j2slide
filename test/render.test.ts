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
    ];
    for (const slide of maxed) {
      const svg = render(slide);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("undefined");
    }
  });

  it("renders in both themes", () => {
    const slide = { type: "bar", title: "T", data: [{ label: "a", value: 1 }] };
    expect(renderSlide(slide, THEMES.dark)).toContain(THEMES.dark.fg);
    expect(renderSlide(slide, THEMES.light)).toContain(THEMES.light.fg);
  });
});
