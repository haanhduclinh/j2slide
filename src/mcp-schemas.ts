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

export interface ToolDefinition {
  name: string;
  description: string;
  /** The slide type this tool produces, or null for non-slide tools. */
  slideType: "bar" | "line" | "pie" | "text" | "kpi" | null;
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
    description: `Show a donut chart of parts of a whole. Aggregate anything beyond ${L.PIE_MAX} slices into an "Other" slice yourself.`,
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
    name: "clear_deck",
    description: "Remove every slide from the deck. Call this once at the start of a new presentation.",
    slideType: null,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];
