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
    expect(ok({ type: "table", title: "T", rows: [] })).toBe(false);
  });

  it("reports the offending field path on failure", () => {
    const result = SlideInput.safeParse({ type: "bar", title: "", data: [{ label: "a", value: 1 }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "title")).toBe(true);
    }
  });
});
