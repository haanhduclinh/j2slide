import { describe, it, expect } from "vitest";
import { L } from "../src/limits";
import { SlideInput } from "../src/schemas";

const ok = (v: unknown) => SlideInput.safeParse(v).success;

describe("slide schemas", () => {
  it("accepts a minimal bar slide", () => {
    expect(ok({ type: "bar", title: "Revenue", data: [{ label: "Q1", value: 1 }] })).toBe(true);
  });

  it("accepts a bar slide at every boundary", () => {
    expect(ok({
      type: "bar",
      title: "t".repeat(L.TITLE_MAX),
      unit: "u".repeat(L.UNIT_MAX),
      data: Array.from({ length: L.SERIES_MAX }, (_, i) => ({
        label: "l".repeat(L.LABEL_MAX),
        value: i,
      })),
    })).toBe(true);
  });

  it("rejects one point past the series cap", () => {
    expect(ok({
      type: "bar",
      title: "Revenue",
      data: Array.from({ length: L.SERIES_MAX + 1 }, (_, i) => ({ label: `l${i}`, value: i })),
    })).toBe(false);
  });

  it("accepts a 14-day line series (time-series decks)", () => {
    expect(ok({
      type: "line",
      title: "Organic clicks 14d",
      data: Array.from({ length: 14 }, (_, i) => ({ label: `D${i + 1}`, value: 100 + i })),
    })).toBe(true);
  });

  it("accepts 30 categories on area charts", () => {
    expect(ok({
      type: "area",
      title: "Traffic 30d",
      categories: Array.from({ length: 30 }, (_, i) => `D${i + 1}`),
      series: [{ name: "Organic", values: Array.from({ length: 30 }, (_, i) => i) }],
    })).toBe(true);
  });

  it("rejects a title one character too long", () => {
    expect(ok({ type: "bar", title: "t".repeat(L.TITLE_MAX + 1), data: [{ label: "a", value: 1 }] })).toBe(false);
  });

  it("rejects an empty data array", () => {
    expect(ok({ type: "bar", title: "Revenue", data: [] })).toBe(false);
  });

  it("rejects a non-finite value", () => {
    expect(ok({ type: "line", title: "Trend", data: [{ label: "a", value: Number.POSITIVE_INFINITY }] })).toBe(false);
  });

  it("rejects a negative pie value", () => {
    expect(ok({ type: "pie", title: "Share", data: [{ label: "a", value: -1 }] })).toBe(false);
  });

  it("enforces the pie slice cap separately from bar", () => {
    const slices = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `l${i}`, value: 1 }));
    expect(ok({ type: "pie", title: "Share", data: slices(L.PIE_MAX) })).toBe(true);
    expect(ok({ type: "pie", title: "Share", data: slices(L.PIE_MAX + 1) })).toBe(false);
  });

  it("enforces text bullet limits", () => {
    const bullets = (n: number, len: number) => Array.from({ length: n }, () => "b".repeat(len));
    expect(ok({ type: "text", title: "Findings", bullets: bullets(L.BULLETS_MAX, L.BULLET_MAX) })).toBe(true);
    expect(ok({ type: "text", title: "Findings", bullets: bullets(L.BULLETS_MAX + 1, 5) })).toBe(false);
    expect(ok({ type: "text", title: "Findings", bullets: bullets(1, L.BULLET_MAX + 1) })).toBe(false);
  });

  it("enforces kpi item limits", () => {
    const items = (n: number) => Array.from({ length: n }, () => ({ label: "Revenue", value: "12.4M" }));
    expect(ok({ type: "kpi", title: "This month", items: items(L.KPI_MAX) })).toBe(true);
    expect(ok({ type: "kpi", title: "This month", items: items(L.KPI_MAX + 1) })).toBe(false);
    expect(ok({ type: "kpi", title: "This month", items: [{ label: "R", value: "v".repeat(L.KPI_VALUE_MAX + 1) }] })).toBe(false);
  });

  it("accepts an optional trend but rejects an unknown one", () => {
    const item = (trend: string) => ({ type: "kpi", title: "M", items: [{ label: "R", value: "1", delta: "5%", trend }] });
    expect(ok(item("up"))).toBe(true);
    expect(ok(item("sideways"))).toBe(false);
  });

  it("rejects an unknown slide type", () => {
    expect(ok({ type: "heatmap", title: "T", data: [] })).toBe(false);
  });

  it("accepts table / area / stacked_bar / scatter / donut minima", () => {
    expect(ok({
      type: "table", title: "T",
      columns: ["A", "B"],
      rows: [["1", "2"]],
    })).toBe(true);
    expect(ok({
      type: "area", title: "T",
      categories: ["Q1", "Q2"],
      series: [{ name: "A", values: [1, 2] }],
    })).toBe(true);
    expect(ok({
      type: "stacked_bar", title: "T",
      categories: ["Q1"],
      series: [{ name: "A", values: [1] }, { name: "B", values: [2] }],
    })).toBe(true);
    expect(ok({
      type: "scatter", title: "T",
      points: [{ x: 1, y: 2, label: "p" }],
    })).toBe(true);
    expect(ok({
      type: "donut", title: "T",
      data: [{ label: "a", value: 1 }],
    })).toBe(true);
  });

  it("rejects multi-series length mismatch", () => {
    expect(ok({
      type: "area", title: "T",
      categories: ["Q1", "Q2"],
      series: [{ name: "A", values: [1] }],
    })).toBe(false);
  });

  it("rejects negative stacked_bar values", () => {
    expect(ok({
      type: "stacked_bar", title: "T",
      categories: ["Q1"],
      series: [{ name: "A", values: [-1] }],
    })).toBe(false);
  });

  it("rejects ragged table rows", () => {
    expect(ok({
      type: "table", title: "T",
      columns: ["A", "B"],
      rows: [["1"]],
    })).toBe(false);
  });

  it("rejects too many scatter points", () => {
    expect(ok({
      type: "scatter",
      title: "T",
      points: Array.from({ length: L.SCATTER_MAX + 1 }, (_, i) => ({ x: i, y: i })),
    })).toBe(false);
  });

  it("reports the offending field path on failure", () => {
    const result = SlideInput.safeParse({ type: "bar", title: "", data: [{ label: "a", value: 1 }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "title")).toBe(true);
    }
  });

  it("accepts a composite with image + text + bar chart", () => {
    expect(ok({
      type: "composite",
      title: "Q3 update",
      layout: "split",
      blocks: [
        { type: "image", url: "https://cdn.example.com/a.png", alt: "Hero" },
        { type: "text", bullets: ["Up 12%", "Churn flat"] },
        { type: "chart", chart: "bar", unit: "M", data: [{ label: "Q1", value: 10 }, { label: "Q2", value: 12 }] },
      ],
    })).toBe(true);
  });

  it("accepts composite without layout (defaults at render)", () => {
    expect(ok({
      type: "composite",
      title: "T",
      blocks: [{ type: "text", bullets: ["only"] }],
    })).toBe(true);
  });

  it("rejects composite with 0 or 5 blocks", () => {
    expect(ok({ type: "composite", title: "T", blocks: [] })).toBe(false);
    expect(ok({
      type: "composite", title: "T",
      blocks: Array.from({ length: 5 }, () => ({ type: "text", bullets: ["x"] })),
    })).toBe(false);
  });

  it("rejects two image or two chart blocks", () => {
    expect(ok({
      type: "composite", title: "T",
      blocks: [
        { type: "image", url: "https://a.com/1.png" },
        { type: "image", url: "https://a.com/2.png" },
      ],
    })).toBe(false);
    expect(ok({
      type: "composite", title: "T",
      blocks: [
        { type: "chart", chart: "pie", data: [{ label: "a", value: 1 }] },
        { type: "chart", chart: "bar", data: [{ label: "a", value: 1 }] },
      ],
    })).toBe(false);
  });

  it("rejects non-https image urls", () => {
    for (const url of ["http://x.com/a.png", "data:image/png;base64,xx", "//cdn.x/a.png", "ftp://x/a"]) {
      expect(ok({
        type: "composite", title: "T",
        blocks: [{ type: "image", url }],
      })).toBe(false);
    }
  });

  it("rejects nested chart past composite series cap and unknown chart kinds", () => {
    expect(ok({
      type: "composite", title: "T",
      blocks: [{
        type: "chart", chart: "bar",
        data: Array.from({ length: L.COMPOSITE_CHART_SERIES_MAX + 1 }, (_, i) => ({ label: `l${i}`, value: i })),
      }],
    })).toBe(false);
    expect(ok({
      type: "composite", title: "T",
      blocks: [{ type: "chart", chart: "scatter", data: [{ label: "a", value: 1 }] }],
    })).toBe(false);
  });

  it("allows two text blocks under the total cap", () => {
    expect(ok({
      type: "composite", title: "T",
      blocks: [
        { type: "text", bullets: ["a"] },
        { type: "text", bullets: ["b"] },
        { type: "image", url: "https://cdn.example.com/x.png" },
      ],
    })).toBe(true);
  });

  it("rejects an unknown composite layout", () => {
    expect(ok({
      type: "composite",
      title: "T",
      layout: "grid",
      blocks: [{ type: "text", bullets: ["a"] }],
    })).toBe(false);
  });

  it("enforces composite text bullet count and pie non-negative values", () => {
    expect(ok({
      type: "composite",
      title: "T",
      blocks: [{
        type: "text",
        bullets: Array.from({ length: L.COMPOSITE_TEXT_BULLETS_MAX }, (_, i) => `b${i}`),
      }],
    })).toBe(true);
    expect(ok({
      type: "composite",
      title: "T",
      blocks: [{
        type: "text",
        bullets: Array.from({ length: L.COMPOSITE_TEXT_BULLETS_MAX + 1 }, (_, i) => `b${i}`),
      }],
    })).toBe(false);
    expect(ok({
      type: "composite",
      title: "T",
      blocks: [{ type: "chart", chart: "pie", data: [{ label: "a", value: -1 }] }],
    })).toBe(false);
  });

  it("accepts nested bar at the composite series boundary and chart-only slides", () => {
    expect(ok({
      type: "composite",
      title: "T",
      blocks: [{
        type: "chart",
        chart: "bar",
        data: Array.from({ length: L.COMPOSITE_CHART_SERIES_MAX }, (_, i) => ({
          label: `l${i}`,
          value: i,
        })),
      }],
    })).toBe(true);
    expect(ok({
      type: "composite",
      title: "T",
      blocks: [{ type: "chart", chart: "donut", data: [{ label: "a", value: 1 }, { label: "b", value: 2 }] }],
    })).toBe(true);
    expect(ok({
      type: "composite",
      title: "T",
      blocks: [{ type: "chart", chart: "line", data: [{ label: "a", value: 1 }] }],
    })).toBe(true);
  });
});
