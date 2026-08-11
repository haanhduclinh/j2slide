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

const cell = z.string().min(1).max(L.TABLE_CELL_MAX);

export const TableSlide = z.object({
  type: z.literal("table"),
  title,
  columns: z.array(cell).min(1).max(L.TABLE_COLS_MAX),
  rows: z.array(z.array(cell).min(1)).min(1).max(L.TABLE_ROWS_MAX),
}).openapi("TableSlide");

const multiSeriesFields = {
  title,
  unit: z.string().max(L.UNIT_MAX).optional(),
  categories: z.array(label).min(1).max(L.CATEGORIES_MAX),
  series: z.array(z.object({
    name: label,
    values: z.array(finite).min(1),
  })).min(1).max(L.MULTI_SERIES_MAX),
};

export const AreaSlide = z.object({
  type: z.literal("area"),
  ...multiSeriesFields,
}).openapi("AreaSlide");

export const StackedBarSlide = z.object({
  type: z.literal("stacked_bar"),
  ...multiSeriesFields,
}).openapi("StackedBarSlide");

export const ScatterSlide = z.object({
  type: z.literal("scatter"),
  title,
  x_label: z.string().min(1).max(L.LABEL_MAX).optional(),
  y_label: z.string().min(1).max(L.LABEL_MAX).optional(),
  points: z.array(z.object({
    x: finite,
    y: finite,
    label: z.string().min(1).max(L.LABEL_MAX).optional(),
    series: z.string().min(1).max(L.LABEL_MAX).optional(),
  })).min(1).max(L.SCATTER_MAX),
}).openapi("ScatterSlide");

export const DonutSlide = z.object({
  type: z.literal("donut"),
  title,
  data: z.array(PieSlice).min(1).max(L.PIE_MAX),
}).openapi("DonutSlide");

const httpsUrl = z.string().min(1).max(L.IMAGE_URL_MAX).refine(
  (u) => u.startsWith("https://"),
  { message: "image url must start with https://" },
);

export const ImageBlock = z.object({
  type: z.literal("image"),
  url: httpsUrl,
  alt: z.string().min(1).max(L.IMAGE_ALT_MAX).optional(),
}).openapi("ImageBlock");

export const CompositeTextBlock = z.object({
  type: z.literal("text"),
  bullets: z.array(z.string().min(1).max(L.BULLET_MAX)).min(1).max(L.COMPOSITE_TEXT_BULLETS_MAX),
}).openapi("CompositeTextBlock");

const compositeSeriesData = z.array(Point).min(1).max(L.COMPOSITE_CHART_SERIES_MAX);
const compositePieData = z.array(PieSlice).min(1).max(L.PIE_MAX);

/** Flattened chart block variants so the parent blocks array can stay a simple union. */
const ChartBlockBar = z.object({
  type: z.literal("chart"),
  chart: z.literal("bar"),
  unit: z.string().max(L.UNIT_MAX).optional(),
  data: compositeSeriesData,
}).openapi("ChartBlockBar");

const ChartBlockLine = z.object({
  type: z.literal("chart"),
  chart: z.literal("line"),
  unit: z.string().max(L.UNIT_MAX).optional(),
  data: compositeSeriesData,
}).openapi("ChartBlockLine");

const ChartBlockPie = z.object({
  type: z.literal("chart"),
  chart: z.literal("pie"),
  data: compositePieData,
}).openapi("ChartBlockPie");

const ChartBlockDonut = z.object({
  type: z.literal("chart"),
  chart: z.literal("donut"),
  data: compositePieData,
}).openapi("ChartBlockDonut");

export const CompositeBlock = z.union([
  ImageBlock,
  CompositeTextBlock,
  ChartBlockBar,
  ChartBlockLine,
  ChartBlockPie,
  ChartBlockDonut,
]);

export const CompositeSlide = z.object({
  type: z.literal("composite"),
  title,
  layout: z.enum(["stack", "split"]).optional(),
  blocks: z.array(CompositeBlock).min(1).max(L.COMPOSITE_BLOCKS_MAX),
}).openapi("CompositeSlide");

/**
 * Cross-field rules cannot live on discriminatedUnion members (ZodEffects is
 * rejected). Apply them on the union instead.
 */
export const SlideInput = z.discriminatedUnion("type", [
  BarSlide, LineSlide, PieSlide, TextSlide, KpiSlide,
  TableSlide, AreaSlide, StackedBarSlide, ScatterSlide, DonutSlide,
  CompositeSlide,
]).superRefine((val, ctx) => {
  if (val.type === "table") {
    const cols = val.columns.length;
    val.rows.forEach((row, i) => {
      if (row.length !== cols) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `rows[${i}] length must equal columns.length (${cols})`,
          path: ["rows", i],
        });
      }
    });
  }

  if (val.type === "area" || val.type === "stacked_bar") {
    const nCats = val.categories.length;
    val.series.forEach((s, i) => {
      if (s.values.length !== nCats) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `series[${i}].values length must equal categories.length (${nCats})`,
          path: ["series", i, "values"],
        });
      }
      if (val.type === "stacked_bar") {
        s.values.forEach((v, j) => {
          if (v < 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "stacked_bar values must be >= 0",
              path: ["series", i, "values", j],
            });
          }
        });
      }
    });
  }

  if (val.type === "composite") {
    let images = 0;
    let charts = 0;
    for (const block of val.blocks) {
      if (block.type === "image") images += 1;
      if (block.type === "chart") charts += 1;
    }
    if (images > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "at most one image block",
        path: ["blocks"],
      });
    }
    if (charts > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "at most one chart block",
        path: ["blocks"],
      });
    }
  }
});

export type SlideInput = z.infer<typeof SlideInput>;

/** A slide as stored and broadcast: the validated input plus deck-assigned fields. */
export type Slide = SlideInput & { seq: number; createdAt: number };
