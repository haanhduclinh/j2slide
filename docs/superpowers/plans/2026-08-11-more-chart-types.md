# More Chart Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five slide types (`table`, `area`, `stacked_bar`, `scatter`, `donut`) with Zod validation, MCP `present_*` tools, pure SVG modular renderers, tests, and README updates.

**Architecture:** Expand `SlideInput` discriminated union and MCP tool list; shared multi-series schema (`categories` + `series`); pure SVG renderers under `public/renderers/` dispatched from `public/render.js`; themes unchanged.

**Tech Stack:** TypeScript, Zod via `@hono/zod-openapi`, Cloudflare Workers, Vitest workers pool, hand-written SVG (no chart libraries).

## Global Constraints

- No new npm dependencies
- Pure SVG only: `renderX(slide, theme) → string`
- Multi-series shape: `categories[]` + `series[{ name, values[] }]` for `area` and `stacked_bar`
- `stacked_bar` values ≥ 0; `area` allows negatives; multi-series area is **overlaid** (not stacked fills)
- `donut` payload matches pie; visually ring + center total. Existing `pie` renderer already draws a ring — keep pie behavior stable; donut may share geometry with distinct classes / center label
- MCP: one tool per type (`present_table`, `present_area`, `present_stacked_bar`, `present_scatter`, `present_donut`)
- Limits from `src/limits.ts` only; MCP/Zod must match
- Existing bar/line/pie/text/kpi behavior and tests must stay green
- Update `test/schemas.test.ts` case that currently expects `type: "table"` to be rejected

## File map

| File | Action |
|---|---|
| `src/limits.ts` | Add CATEGORIES_MAX, MULTI_SERIES_MAX, TABLE_*, SCATTER_MAX |
| `src/schemas.ts` | Shared multi-series + 5 types + union |
| `src/mcp-schemas.ts` | 5 tools + slideType union |
| `public/renderers/shared.js` | Optional shared plot helpers if extracted |
| `public/renderers/table.js` | `renderTable` |
| `public/renderers/area.js` | `renderArea` |
| `public/renderers/stacked-bar.js` | `renderStackedBar` |
| `public/renderers/scatter.js` | `renderScatter` |
| `public/renderers/donut.js` | `renderDonut` |
| `public/render.js` | Import + register new RENDERERS |
| `test/schemas.test.ts` | New accept/reject cases |
| `test/render.test.ts` | SVG asserts for 5 types |
| `test/mcp.test.ts` | tools list + one present_* path |
| `README.md` | Document types + tools |

Spec: `docs/superpowers/specs/2026-08-11-more-chart-types-design.md`

---

### Task 1: Limits + Zod schemas

**Files:**
- Modify: `src/limits.ts`
- Modify: `src/schemas.ts`
- Modify: `test/schemas.test.ts`

**Interfaces:**
- Produces: `SlideInput` accepts `table | area | stacked_bar | scatter | donut`
- Produces: `L.CATEGORIES_MAX=12`, `L.MULTI_SERIES_MAX=6`, `L.TABLE_COLS_MAX=6`, `L.TABLE_ROWS_MAX=12`, `L.TABLE_CELL_MAX=32`, `L.SCATTER_MAX=40`

- [ ] **Step 1: Extend limits**

Add to `L` in `src/limits.ts`:

```ts
CATEGORIES_MAX: 12,
MULTI_SERIES_MAX: 6,
TABLE_COLS_MAX: 6,
TABLE_ROWS_MAX: 12,
TABLE_CELL_MAX: 32,
SCATTER_MAX: 40,
```

- [ ] **Step 2: Write failing schema tests**

In `test/schemas.test.ts`:

1. Replace “rejects unknown slide type” `table` case with a real unknown type e.g. `type: "heatmap"`.
2. Add tests:

```ts
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
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npm test -- test/schemas.test.ts`

- [ ] **Step 4: Implement schemas**

In `src/schemas.ts`:

```ts
const nonEmptyLabel = label; // existing label helper

const MultiSeriesBody = z.object({
  title,
  unit: z.string().max(L.UNIT_MAX).optional(),
  categories: z.array(label).min(1).max(L.CATEGORIES_MAX),
  series: z.array(z.object({
    name: label,
    values: z.array(finite).min(1),
  })).min(1).max(L.MULTI_SERIES_MAX),
}).superRefine((val, ctx) => {
  const n = val.categories.length;
  val.series.forEach((s, i) => {
    if (s.values.length !== n) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `series[${i}].values length must equal categories.length (${n})`,
        path: ["series", i, "values"],
      });
    }
  });
});

export const AreaSlide = MultiSeriesBody.extend({
  type: z.literal("area"),
}).openapi("AreaSlide");

export const StackedBarSlide = MultiSeriesBody.extend({
  type: z.literal("stacked_bar"),
}).superRefine((val, ctx) => {
  val.series.forEach((s, i) => {
    s.values.forEach((v, j) => {
      if (v < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "stacked_bar values must be >= 0",
          path: ["series", i, "values", j],
        });
      }
    });
  });
}).openapi("StackedBarSlide");

// Note: MultiSeriesBody.extend + second superRefine — if Zod typing is awkward,
// implement StackedBarSlide as z.object({ type, ...fields }).superRefine(both checks).

export const TableSlide = z.object({
  type: z.literal("table"),
  title,
  columns: z.array(z.string().min(1).max(L.TABLE_CELL_MAX)).min(1).max(L.TABLE_COLS_MAX),
  rows: z.array(z.array(z.string().min(1).max(L.TABLE_CELL_MAX)).min(1)).min(1).max(L.TABLE_ROWS_MAX),
}).superRefine((val, ctx) => {
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
}).openapi("TableSlide");

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

export const SlideInput = z.discriminatedUnion("type", [
  BarSlide, LineSlide, PieSlide, TextSlide, KpiSlide,
  TableSlide, AreaSlide, StackedBarSlide, ScatterSlide, DonutSlide,
]);
```

If `.extend` on refined objects fails, flatten multi-series into explicit `z.object` + one `superRefine` per type.

- [ ] **Step 5: Run schema tests — expect PASS**

Run: `npm test -- test/schemas.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/limits.ts src/schemas.ts test/schemas.test.ts
git commit -m "feat: schemas and limits for five new slide types"
```

---

### Task 2: MCP tools

**Files:**
- Modify: `src/mcp-schemas.ts`
- Modify: `test/mcp.test.ts` (and any tool-count asserts)

**Interfaces:**
- Produces: `TOOL_DEFINITIONS` includes five new tools; `slideType` union includes new types

- [ ] **Step 1: Extend `slideType` and add schemas + tools**

Mirror Zod limits in JSON Schema. Example multi-series block:

```ts
const multiSeries = {
  type: "object",
  properties: {
    title,
    unit: { type: "string", maxLength: L.UNIT_MAX },
    categories: {
      type: "array", minItems: 1, maxItems: L.CATEGORIES_MAX,
      items: label,
    },
    series: {
      type: "array", minItems: 1, maxItems: L.MULTI_SERIES_MAX,
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
```

Table / scatter / donut similarly. Note: MCP JSON Schema cannot express “values.length === categories.length” easily — Zod remains the enforcement gate on the server when tools are called (same as other refinements).

Add tools: `present_table`, `present_area`, `present_stacked_bar`, `present_scatter`, `present_donut`.

- [ ] **Step 2: Update MCP tests** for tool names presence and one successful `present_table` (or `present_donut`) call that creates a slide.

- [ ] **Step 3: `npm test -- test/mcp.test.ts` PASS**

- [ ] **Step 4: Commit**

```bash
git add src/mcp-schemas.ts test/mcp.test.ts
git commit -m "feat: MCP present_* tools for new chart types"
```

---

### Task 3: SVG renderers + dispatcher

**Files:**
- Create: `public/renderers/table.js`, `area.js`, `stacked-bar.js`, `scatter.js`, `donut.js`
- Modify: `public/render.js`
- Modify: `test/render.test.ts`

**Interfaces:**
- Each file exports `export function renderX(slide, theme) { return bodySvgFragment; }` — **body only** (no outer `<svg>`), matching existing `renderBar` style which returns body for `frame()`.
- `render.js` maps type → renderer in `RENDERERS`.

- [ ] **Step 1: Failing render tests**

```ts
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
});

// extend “every slide type” canvas test to include the five new types
```

- [ ] **Step 2: Implement renderers**

Helpers needed inside each file or a small `public/renderers/_svg.js`: `esc`, `n`, `text` — either duplicate minimal helpers or export them from `render.js`. Prefer exporting helpers from `render.js` (`export { esc, n, text, CANVAS, CONTENT_TOP, ... }`) to avoid drift, **or** keep helpers private and pass nothing extra by inlining small `esc`/`n` in each module (DRY secondary to isolation).

Recommended: export canvas constants + `esc`/`n`/`text`/`formatValue` from `render.js`, import in renderers.

**table:** grid of rects + text; header row stronger weight; `class="table-cell"` on cell text.

**stacked_bar:** for each category index, stack series values bottom-up; `class="stack-seg"` on each rect; legend.

**area:** for each series, build closed path from baseline through points; fill with series color + opacity; stroke line; `class="area-series"`.

**scatter:** compute min/max x/y with padding; map to plot box; circles `class="scatter-point"`; optional axis labels.

**donut:** copy pie geometry from `renderPie` (outer/inner); add center text with sum `class="donut-center"`.

- [ ] **Step 3: Register in RENDERERS**

```js
import { renderTable } from "./renderers/table.js";
// ...
const RENDERERS = {
  bar: renderBar,
  // ...
  table: renderTable,
  area: renderArea,
  stacked_bar: renderStackedBar,
  scatter: renderScatter,
  donut: renderDonut,
};
```

- [ ] **Step 4: `npm test -- test/render.test.ts` PASS**

- [ ] **Step 5: Commit**

```bash
git add public/render.js public/renderers test/render.test.ts
git commit -m "feat: pure SVG renderers for table area stacked_bar scatter donut"
```

---

### Task 4: Integration + docs

**Files:**
- Modify: `README.md`
- Possibly: `test/routes.decks.test.ts` if it enumerates types
- Run full suite

- [ ] **Step 1: README** — list all 10 types; MCP tools; example JSON for `stacked_bar` or `table`

- [ ] **Step 2: Full test**

Run: `npm test && npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document new chart types and MCP tools"
```

---

## Self-review checklist

- [x] Spec types all have schema + MCP + renderer + tests tasks
- [x] No chart library
- [x] Multi-series length refine on server
- [x] Unknown-type test updated away from `table`
- [x] Pie visual stability called out for donut implementation
