import { L } from "./limits";

/**
 * JSON Schema for the MCP tools, built from the same constants as the Zod
 * schemas. Hand-written rather than converted so there is no dependency on a
 * Zod-version-specific conversion library; `test/mcp.test.ts` asserts the
 * published limits match `src/limits.ts`.
 */
const title = { type: "string", minLength: 1, maxLength: L.TITLE_MAX } as const;
const label = { type: "string", minLength: 1, maxLength: L.LABEL_MAX } as const;

const point = {
  type: "object",
  properties: { label, value: { type: "number" } },
  required: ["label", "value"],
  additionalProperties: false,
} as const;

const series = (maxItems: number) => ({
  type: "object",
  properties: {
    title,
    unit: { type: "string", maxLength: L.UNIT_MAX },
    data: { type: "array", minItems: 1, maxItems, items: point },
  },
  required: ["title", "data"],
  additionalProperties: false,
});

const pie = {
  type: "object",
  properties: {
    title,
    data: {
      type: "array",
      minItems: 1,
      maxItems: L.PIE_MAX,
      items: {
        type: "object",
        properties: { label, value: { type: "number", minimum: 0 } },
        required: ["label", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "data"],
  additionalProperties: false,
};

const text = {
  type: "object",
  properties: {
    title,
    bullets: {
      type: "array",
      minItems: 1,
      maxItems: L.BULLETS_MAX,
      items: { type: "string", minLength: 1, maxLength: L.BULLET_MAX },
    },
  },
  required: ["title", "bullets"],
  additionalProperties: false,
};

const kpi = {
  type: "object",
  properties: {
    title,
    items: {
      type: "array",
      minItems: 1,
      maxItems: L.KPI_MAX,
      items: {
        type: "object",
        properties: {
          label,
          value: { type: "string", minLength: 1, maxLength: L.KPI_VALUE_MAX },
          delta: { type: "string", maxLength: L.KPI_DELTA_MAX },
          trend: { type: "string", enum: ["up", "down", "flat"] },
        },
        required: ["label", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "items"],
  additionalProperties: false,
};

const cell = { type: "string", minLength: 1, maxLength: L.TABLE_CELL_MAX } as const;

const table = {
  type: "object",
  properties: {
    title,
    columns: {
      type: "array",
      minItems: 1,
      maxItems: L.TABLE_COLS_MAX,
      items: cell,
    },
    rows: {
      type: "array",
      minItems: 1,
      maxItems: L.TABLE_ROWS_MAX,
      items: {
        type: "array",
        minItems: 1,
        items: cell,
      },
    },
  },
  required: ["title", "columns", "rows"],
  additionalProperties: false,
} as const;

const multiSeries = {
  type: "object",
  properties: {
    title,
    unit: { type: "string", maxLength: L.UNIT_MAX },
    categories: {
      type: "array",
      minItems: 1,
      maxItems: L.CATEGORIES_MAX,
      items: label,
    },
    series: {
      type: "array",
      minItems: 1,
      maxItems: L.MULTI_SERIES_MAX,
      items: {
        type: "object",
        properties: {
          name: label,
          values: { type: "array", minItems: 1, items: { type: "number" } },
        },
        required: ["name", "values"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "categories", "series"],
  additionalProperties: false,
} as const;

const scatter = {
  type: "object",
  properties: {
    title,
    x_label: label,
    y_label: label,
    points: {
      type: "array",
      minItems: 1,
      maxItems: L.SCATTER_MAX,
      items: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          label,
          series: label,
        },
        required: ["x", "y"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "points"],
  additionalProperties: false,
} as const;

const compositePoint = {
  type: "object",
  properties: { label, value: { type: "number" } },
  required: ["label", "value"],
  additionalProperties: false,
} as const;

const compositePiePoint = {
  type: "object",
  properties: { label, value: { type: "number", minimum: 0 } },
  required: ["label", "value"],
  additionalProperties: false,
} as const;

const composite = {
  type: "object",
  properties: {
    title,
    layout: { type: "string", enum: ["stack", "split"] },
    blocks: {
      type: "array",
      minItems: 1,
      maxItems: L.COMPOSITE_BLOCKS_MAX,
      items: {
        oneOf: [
          {
            type: "object",
            properties: {
              type: { type: "string", const: "image" },
              url: { type: "string", minLength: 1, maxLength: L.IMAGE_URL_MAX },
              alt: { type: "string", minLength: 1, maxLength: L.IMAGE_ALT_MAX },
            },
            required: ["type", "url"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { type: "string", const: "text" },
              bullets: {
                type: "array",
                minItems: 1,
                maxItems: L.COMPOSITE_TEXT_BULLETS_MAX,
                items: { type: "string", minLength: 1, maxLength: L.BULLET_MAX },
              },
            },
            required: ["type", "bullets"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { type: "string", const: "chart" },
              chart: { type: "string", enum: ["bar", "line"] },
              unit: { type: "string", maxLength: L.UNIT_MAX },
              data: {
                type: "array",
                minItems: 1,
                maxItems: L.COMPOSITE_CHART_SERIES_MAX,
                items: compositePoint,
              },
            },
            required: ["type", "chart", "data"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { type: "string", const: "chart" },
              chart: { type: "string", enum: ["pie", "donut"] },
              data: {
                type: "array",
                minItems: 1,
                maxItems: L.PIE_MAX,
                items: compositePiePoint,
              },
            },
            required: ["type", "chart", "data"],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ["title", "blocks"],
  additionalProperties: false,
} as const;

export type SlideType =
  | "bar"
  | "line"
  | "pie"
  | "text"
  | "kpi"
  | "table"
  | "area"
  | "stacked_bar"
  | "scatter"
  | "donut"
  | "composite";

export interface ToolDefinition {
  name: string;
  description: string;
  /** The slide type this tool produces, or null for non-slide tools. */
  slideType: SlideType | null;
  inputSchema: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "present_bar",
    description: `Show a bar chart on the shared screen. Use for comparing up to ${L.SERIES_MAX} categories.`,
    slideType: "bar",
    inputSchema: series(L.SERIES_MAX),
  },
  {
    name: "present_line",
    description: `Show a line chart on the shared screen. Use for a trend over up to ${L.SERIES_MAX} ordered points.`,
    slideType: "line",
    inputSchema: series(L.SERIES_MAX),
  },
  {
    name: "present_pie",
    description: `Show a pie/ring chart of parts of a whole. Aggregate anything beyond ${L.PIE_MAX} slices into an "Other" slice yourself.`,
    slideType: "pie",
    inputSchema: pie,
  },
  {
    name: "present_text",
    description: `Show a title with up to ${L.BULLETS_MAX} bullet points. Use to introduce or summarise a section.`,
    slideType: "text",
    inputSchema: text,
  },
  {
    name: "present_kpi",
    description: `Show up to ${L.KPI_MAX} headline numbers with optional change indicators.`,
    slideType: "kpi",
    inputSchema: kpi,
  },
  {
    name: "present_table",
    description: `Show a table with up to ${L.TABLE_COLS_MAX} columns and ${L.TABLE_ROWS_MAX} rows. Every row must match the column count.`,
    slideType: "table",
    inputSchema: table,
  },
  {
    name: "present_area",
    description: `Show an area chart with up to ${L.MULTI_SERIES_MAX} series and ${L.CATEGORIES_MAX} categories. Each series.values length must match categories.`,
    slideType: "area",
    inputSchema: multiSeries,
  },
  {
    name: "present_stacked_bar",
    description: `Show a stacked bar chart (non-negative values) with up to ${L.MULTI_SERIES_MAX} series and ${L.CATEGORIES_MAX} categories.`,
    slideType: "stacked_bar",
    inputSchema: multiSeries,
  },
  {
    name: "present_scatter",
    description: `Show a scatter plot with up to ${L.SCATTER_MAX} points. Optional per-point series groups colour.`,
    slideType: "scatter",
    inputSchema: scatter,
  },
  {
    name: "present_donut",
    description: `Show a donut chart of parts of a whole (ring with center total). Max ${L.PIE_MAX} slices.`,
    slideType: "donut",
    inputSchema: pie,
  },
  {
    name: "present_composite",
    description:
      `Show a composite slide with 1–${L.COMPOSITE_BLOCKS_MAX} blocks (image, text, chart). ` +
      `At most one image and one chart. Image urls must be https://. ` +
      `Nested charts: bar/line (≤${L.COMPOSITE_CHART_SERIES_MAX} points) or pie/donut (≤${L.PIE_MAX}). ` +
      `Optional layout: stack (default) or split.`,
    slideType: "composite",
    inputSchema: composite,
  },
  {
    name: "clear_deck",
    description: "Remove every slide from the deck. Call this once at the start of a new presentation.",
    slideType: null,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];
