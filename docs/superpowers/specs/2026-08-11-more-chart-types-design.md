# j2slide — More chart types (design)

**Date:** 2026-08-11  
**Status:** Approved for implementation  
**Parent:** [j2slide design](./2026-08-02-j2slide-design.md)

## Problem

Agents need a richer chart vocabulary for live decks. Today only five slide types
exist (`bar`, `line`, `pie`, `text`, `kpi`). The original design explicitly left
out tables, scatter, stacked charts, and similar types. Those gaps show up as
awkward workarounds (e.g. forcing a table into `text` bullets).

## Goal

Add **five new slide types** while preserving j2slide’s core constraints:

- Pure SVG renderers (`renderX(slide, theme) → string`), no chart library
- Zod as the single source of slide shape; MCP JSON Schema mirrors limits
- Dark / light themes only (viewer `T` toggle) — **no new presentation themes**
- No changes to auth, DeckDO storage model, WebSocket message envelope, or idle expiry

## Decisions (from brainstorming)

| Topic | Choice |
|---|---|
| Priority | Chart types only (not presentation style packs) |
| New types (v1) | `table`, `area`, `stacked_bar`, `scatter`, `donut` |
| MCP surface | One tool per type (`present_*`), same pattern as today |
| Multi-series shape | `categories[]` + `series[{ name, values[] }]` for `area` and `stacked_bar` |
| Rendering | Pure hand-written SVG only |
| Structure | Modular renderers + shared series schema (Approach 2) |

## Non-goals

- New theme / style packs, agent-supplied colors
- Chart libraries, animation, hover tooltips
- Map, heatmap, histogram, waterfall, combo charts
- Editing or deleting a single slide
- Breaking changes to existing five types’ JSON shapes
- Changing `BODY_BYTES_MAX`, slide cap, or rate limits (except documenting that new types still fit)

## Architecture

```
Agent
  ├─ REST  POST /decks/{id}/slides   { type, …payload }
  └─ MCP   present_table | present_area | present_stacked_bar
           present_scatter | present_donut
        │
        ▼
  Zod SlideInput (discriminatedUnion on type)  ← single validation gate
        │
        ▼
  DeckDO  slide:{seq}  + WS fan-out  { type: "slide", slide, index }
        │
        ▼
  Viewer  renderSlide(slide, theme) → SVG
            └─ RENDERERS[type] from public/renderers/*
```

Viewer, DO, and wire protocol treat slide payloads as opaque JSON once validated.
Unknown types already fall back to “Unsupported slide” in `renderSlide` — keep that.

### Module layout

| Path | Role |
|---|---|
| `src/limits.ts` | New numeric bounds for table / multi-series / scatter |
| `src/schemas.ts` | Shared `CategoriesSeries` helpers; five new Zod objects; expanded union |
| `src/mcp-schemas.ts` | Five new `present_*` tools; widen `slideType` union |
| `src/routes/openapi.ts` | Union picks up new schemas via `SlideInput` (no special-case) |
| `public/theme.js` | **Unchanged** |
| `public/render.js` | Shared frame/helpers + dispatcher; re-export or import per-type renderers |
| `public/renderers/table.js` | Pure `renderTable` |
| `public/renderers/area.js` | Pure `renderArea` |
| `public/renderers/stacked-bar.js` | Pure `renderStackedBar` |
| `public/renderers/scatter.js` | Pure `renderScatter` |
| `public/renderers/donut.js` | Pure `renderDonut` (can share arc math with pie via small helper) |
| `public/renderers/pie.js` *(optional extract)* | Move existing pie if donut shares geometry |
| `test/schemas.test.ts` | Accept/reject cases for new shapes |
| `test/render.test.ts` | SVG structure asserts for new renderers |
| `test/mcp.test.ts` | Tools list + present_* happy path |
| `README.md` | Document new types and tools |

Existing `bar` / `line` / `pie` / `text` / `kpi` may remain in `render.js` for this
change, or move into `public/renderers/` in the same PR if the dispatcher split
is cleaner — either is fine as long as public API `renderSlide` / `renderStandby`
paths stay stable for the viewer script.

**Asset loading:** Viewer already loads modules from `/public`. New renderer modules
must be importable from `render.js` without a bundler (native ES modules on the
Worker assets). Keep imports relative (`./renderers/table.js`).

## Data shapes

All types keep `title` (1…`TITLE_MAX`). Optional `unit` only where values are numeric
series (same as bar/line).

### Shared: multi-series (`area`, `stacked_bar`)

```json
{
  "type": "stacked_bar",
  "title": "Revenue mix",
  "unit": "M",
  "categories": ["Q1", "Q2", "Q3"],
  "series": [
    { "name": "Product", "values": [10, 12, 15] },
    { "name": "Services", "values": [4, 5, 6] }
  ]
}
```

**Validation rules:**

- `categories`: 1…`CATEGORIES_MAX` strings (label length ≤ `LABEL_MAX`)
- `series`: 1…`MULTI_SERIES_MAX` items
- Each series `name`: 1…`LABEL_MAX`
- Each series `values`: **exactly** `categories.length` finite numbers
- `stacked_bar`: every value must be **≥ 0** (stacking negatives is out of scope)
- `area`: values may be negative (overlay from zero baseline like line chart);
  multi-series area is **overlaid** (not stacked) for v1 simplicity — each series
  is a filled path under its line, using `series` colors with opacity

### `table`

```json
{
  "type": "table",
  "title": "Unit economics",
  "columns": ["Metric", "2024", "2025"],
  "rows": [
    ["ARPU", "$12", "$15"],
    ["Churn", "4.2%", "3.1%"]
  ]
}
```

**Validation rules:**

- `columns`: 1…`TABLE_COLS_MAX` non-empty strings ≤ `TABLE_CELL_MAX`
- `rows`: 1…`TABLE_ROWS_MAX` arrays
- Every row length **equals** `columns.length`
- Every cell: string, length 1…`TABLE_CELL_MAX` (agents stringify numbers themselves)

No per-column types, sorting, or markdown in cells.

### `scatter`

```json
{
  "type": "scatter",
  "title": "Risk vs return",
  "x_label": "Risk",
  "y_label": "Return",
  "points": [
    { "x": 0.12, "y": 0.08, "label": "A" },
    { "x": 0.20, "y": 0.15, "label": "B", "series": "Equity" }
  ]
}
```

**Validation rules:**

- `points`: 1…`SCATTER_MAX` items; `x`/`y` finite numbers
- `label` optional (≤ `LABEL_MAX`); shown near point when present, truncated in layout if needed
- `series` optional (≤ `LABEL_MAX`); groups color by series name (stable order = first appearance)
- `x_label` / `y_label` optional axis captions (≤ `LABEL_MAX`)

### `donut`

Same payload as `pie`:

```json
{
  "type": "donut",
  "title": "Traffic share",
  "data": [
    { "label": "Organic", "value": 40 },
    { "label": "Paid", "value": 25 }
  ]
}
```

- Same limits as pie (`PIE_MAX`, non-negative values)
- Visual difference: inner radius hole (~50% of outer); optional center total text
  when all values sum to a finite number

`pie` remains a filled pie (no hole). Do not silently convert; agents pick the type.

## Limits (additions to `src/limits.ts`)

| Constant | Value | Applies to |
|---|---|---|
| `CATEGORIES_MAX` | 12 | `area`, `stacked_bar` categories |
| `MULTI_SERIES_MAX` | 6 | series count for multi-series charts |
| `TABLE_COLS_MAX` | 6 | table columns |
| `TABLE_ROWS_MAX` | 12 | table rows |
| `TABLE_CELL_MAX` | 32 | each header/cell string |
| `SCATTER_MAX` | 40 | scatter points |

Reuse existing: `TITLE_MAX`, `LABEL_MAX`, `UNIT_MAX`, `PIE_MAX`, `BODY_BYTES_MAX`.

Rationale: keep a full multi-series + table slide well under 32 KiB; SVG remains
readable on a 1600×900 canvas.

## MCP tools

Add five tools (names match existing `present_*` style):

| Tool | `slideType` | Input |
|---|---|---|
| `present_table` | `table` | columns + rows |
| `present_area` | `area` | categories + series (+ optional unit) |
| `present_stacked_bar` | `stacked_bar` | categories + series (+ optional unit) |
| `present_scatter` | `scatter` | points (+ optional axis labels) |
| `present_donut` | `donut` | same as pie data |

`clear_deck` unchanged. Tool descriptions must mention the numeric limits from `L`.

MCP route wiring: existing loop over `TOOL_DEFINITIONS` — new entries only; no
protocol change.

## Rendering notes (pure SVG)

Shared canvas remains **1600×900**, same title bar + accent rule + footer from `frame()`.

| Type | Layout sketch |
|---|---|
| `table` | Grid in content area; header row uses `accent`/`muted`; alternating row fill from `grid` at low contrast; cell text truncated with ellipsis if needed in renderer (validation still enforces max length) |
| `area` | Same plot box as line; path fill under each series with opacity ~0.25; stroke on top; legend top-right if series.length > 1 |
| `stacked_bar` | Per-category stack from zero; segment colors = `theme.series[i]`; legend; y-scale = max stack sum |
| `scatter` | Axes with optional labels; points as circles; color by series or `accent` if none; no point if NaN (validated out) |
| `donut` | Arc paths like pie; inner hole; labels outside with leader lines or side legend (match pie’s label strategy for consistency) |

No DOM measurement — font sizes from theme tokens only (same as existing renderers).

## API / OpenAPI / errors

- REST: `SlideInput` union expands; invalid shape → existing `400` validation mapping
- Multi-series length mismatch → Zod refine error, same 400 path
- OpenAPI: new component schemas via existing Zod OpenAPI registrations
- WebSocket: no change (`init` / `slide` / keepalive)

## Testing strategy

1. **Schema unit tests** — accept fixtures; reject empty categories, mismatched
   `values.length`, negative stacked values, ragged table rows, too many scatter points
2. **Render unit tests** — each new type produces SVG containing expected classes or
   structural markers (`class="table-cell"`, `class="area-series"`, stack rects count,
   scatter circles count, donut hole path)
3. **MCP tests** — `tools/list` includes five new names; `tools/call` present_* pushes
   a slide that round-trips through create deck + list slides
4. **Regression** — existing five types’ tests still pass unchanged

## Docs

- README: extend type table and MCP tool list; one curl example for `table` or `stacked_bar`
- This design supersedes the “only five types” non-goal in the parent design for the
  five types listed here only; other excluded types remain out of scope

## Rollout

Single implementation plan / PR series is fine (Approach 2, all five types). No
feature flag. Deploy is ordinary `wrangler deploy`; old viewers that cached old
`render.js` may show “Unsupported slide” until hard refresh — acceptable for a
static asset Worker; no version negotiation required for v1.

## Success criteria

- All ten types validate via Zod and render pure SVG under dark and light themes
- Five new MCP tools work end-to-end in vitest pool
- No new npm dependencies
- `npm test` green; existing bar/line/pie/text/kpi behavior unchanged
- README lists all ten types accurately
