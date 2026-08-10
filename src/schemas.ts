import { z } from "@hono/zod-openapi";
import { L } from "./limits";

const title = z.string().min(1).max(L.TITLE_MAX).openapi({ example: "Revenue by quarter" });

// `.finite()` is not available across all Zod majors; refine instead so the
// schema behaves identically no matter which version resolves.
const finite = z.number().refine((n) => Number.isFinite(n), {
  message: "value must be a finite number",
});

const label = z.string().min(1).max(L.LABEL_MAX);

const Point = z.object({ label, value: finite }).openapi("Point");
const PieSlice = z.object({
  label,
  value: finite.refine((n) => n >= 0, { message: "value must not be negative" }),
}).openapi("PieSlice");

export const BarSlide = z.object({
  type: z.literal("bar"),
  title,
  unit: z.string().max(L.UNIT_MAX).optional().openapi({ example: "M USD" }),
  data: z.array(Point).min(1).max(L.SERIES_MAX),
}).openapi("BarSlide");

export const LineSlide = z.object({
  type: z.literal("line"),
  title,
  unit: z.string().max(L.UNIT_MAX).optional(),
  data: z.array(Point).min(1).max(L.SERIES_MAX),
}).openapi("LineSlide");

export const PieSlide = z.object({
  type: z.literal("pie"),
  title,
  data: z.array(PieSlice).min(1).max(L.PIE_MAX),
}).openapi("PieSlide");

export const TextSlide = z.object({
  type: z.literal("text"),
  title,
  bullets: z.array(z.string().min(1).max(L.BULLET_MAX)).min(1).max(L.BULLETS_MAX),
}).openapi("TextSlide");

export const KpiSlide = z.object({
  type: z.literal("kpi"),
  title,
  items: z.array(z.object({
    label,
    value: z.string().min(1).max(L.KPI_VALUE_MAX).openapi({ example: "12.4M" }),
    delta: z.string().max(L.KPI_DELTA_MAX).optional().openapi({ example: "34%" }),
    trend: z.enum(["up", "down", "flat"]).optional(),
  })).min(1).max(L.KPI_MAX),
}).openapi("KpiSlide");

export const SlideInput = z.discriminatedUnion("type", [
  BarSlide, LineSlide, PieSlide, TextSlide, KpiSlide,
]);

export type SlideInput = z.infer<typeof SlideInput>;

/** A slide as stored and broadcast: the validated input plus deck-assigned fields. */
export type Slide = SlideInput & { seq: number; createdAt: number };
