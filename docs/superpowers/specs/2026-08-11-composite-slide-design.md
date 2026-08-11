# j2slide — Composite slide (design)

**Date:** 2026-08-11  
**Status:** Approved for implementation  
**Parent:** [j2slide design](./2026-08-02-j2slide-design.md)

## Problem

Agents often need a single live slide that combines **image + copy + a small
chart**. Today every slide is a single pure type (`bar`, `text`, …). Pushing
three separate slides breaks the “one beat of the talk = one visual” flow, and
there is no image support at all.

## Goal

Add one slide type, **`composite`**, that holds an ordered list of **blocks**
(`image` | `text` | `chart`) with a light layout hint (`stack` | `split`), while
preserving j2slide’s core constraints:

- Pure SVG renderers (`renderX(slide, theme) → string`), no chart library
- Zod as the single source of slide shape; MCP JSON Schema mirrors limits
- Dark / light themes only — no new presentation themes
- No changes to auth, DeckDO storage model, WebSocket envelope, or idle expiry
- Server does **not** fetch or proxy images

## Decisions (from brainstorming)

| Topic | Choice |
|---|---|
| Model | Free `blocks[]` (not fixed combo types) |
| Layout | Agent hint `layout?: "stack" \| "split"`; default `stack` |
| Block types v1 | `image`, `text`, `chart` only |
| Nested charts | `bar` \| `line` \| `pie` \| `donut` only |
| Image | `https://` URL only; browser loads via SVG `<image href>` |
| Caps | 1–4 blocks; ≤1 `image`; ≤1 `chart` |
| Approach | Single `composite` type + blocks discriminated union |

## Non-goals

- Character / avatar blocks (deferred)
- Nested `kpi`, `table`, `area`, `stacked_bar`, `scatter`
- Image upload, server-side fetch/proxy/cache, `data:` or `http:` URLs
- Free-form x/y positioning, custom colors, arbitrary HTML
- Editing or deleting a single slide
- Breaking changes to existing slide JSON shapes
- Changing `BODY_BYTES_MAX`, slide cap, or rate limits (composite still fits)

## Architecture

```
Agent
  ├─ REST  POST /decks/{id}/slides   { type: "composite", … }
  └─ MCP   present_composite
        │
        ▼
  Zod SlideInput (discriminatedUnion on type)
        + superRefine for block caps and chart data rules
        │
        ▼
  DeckDO  slide:{seq}  + WS fan-out  { type: "slide", slide, index }
        │
        ▼
  Viewer  renderSlide → renderComposite(slide, theme)
            ├─ frame(title, accent) unchanged
            ├─ stack / split region math
            ├─ image → <image href="…" preserveAspectRatio="xMidYMid meet"/>
            ├─ text  → bullet list in region
            └─ chart → existing bar/line/pie/donut geometry scaled into region
```

Viewer, DO, and wire protocol treat the payload as opaque JSON once validated.
Unknown types already fall back to “Unsupported slide” — keep that.

### Module layout

| Path | Role |
|---|---|
| `src/limits.ts` | Composite-specific numeric bounds |
| `src/schemas.ts` | `ImageBlock`, `TextBlock`, `ChartBlock`, `CompositeSlide`; expand union + refine |
| `src/mcp-schemas.ts` | `present_composite` tool; widen `SlideType` |
| `src/routes/openapi.ts` | Picks up via `SlideInput` (no special-case) |
| `public/theme.js` | **Unchanged** |
| `public/render.js` | Register `composite` in `RENDERERS` |
| `public/renderers/composite.js` | Layout + block dispatch |
| `public/draw.js` | Reuse helpers (`text`, `n`, canvas constants) |
| Chart body | Prefer calling shared pure helpers; extract from `render.js` / existing renderers only if needed to avoid duplicating bar/line/pie paths. Acceptable v1: small internal chart-body functions in `composite.js` that mirror existing geometry, or factor `renderBarBody(data, theme, box)` style helpers if extraction is clean. |
| `test/schemas.test.ts` | Accept/reject composite fixtures |
| `test/render.test.ts` | SVG structure for stack/split/image/chart |
| `test/mcp.test.ts` | Tool list + `present_composite` happy path |
| `README.md` | Document type + tool |

**Asset loading:** native ES modules under `/public`; relative import
`./renderers/composite.js` from `render.js`.

## Data shape

```json
{
  "type": "composite",
  "title": "Q3 product update",
  "layout": "split",
  "blocks": [
    {
      "type": "image",
      "url": "https://cdn.example.com/hero.png",
      "alt": "Product screenshot"
    },
    {
      "type": "text",
      "bullets": [
        "Revenue up 12% QoQ",
        "Churn flat at 3.1%"
      ]
    },
    {
      "type": "chart",
      "chart": "bar",
      "unit": "M",
      "data": [
        { "label": "Q1", "value": 10 },
        { "label": "Q2", "value": 12 }
      ]
    }
  ]
}
```

### Fields

| Field | Rules |
|---|---|
| `type` | literal `"composite"` |
| `title` | 1…`TITLE_MAX` (same as all slides) |
| `layout` | optional `"stack"` \| `"split"`; omit → treat as `"stack"` at render and in docs |
| `blocks` | array length 1…`COMPOSITE_BLOCKS_MAX` (4) |

### Block: `image`

| Field | Rules |
|---|---|
| `type` | `"image"` |
| `url` | string, length 1…`IMAGE_URL_MAX`; must start with `https://` (case-sensitive prefix); reject `http:`, `data:`, protocol-relative `//`, empty |
| `alt` | optional, 1…`IMAGE_ALT_MAX` when present |

No width/height from agent — renderer fits the image into its region with
`preserveAspectRatio="xMidYMid meet"`.

### Block: `text`

| Field | Rules |
|---|---|
| `type` | `"text"` |
| `bullets` | 1…`COMPOSITE_TEXT_BULLETS_MAX` (6) strings; each 1…`BULLET_MAX` |

No per-block title (slide-level `title` is enough).

### Block: `chart`

| Field | Rules |
|---|---|
| `type` | `"chart"` |
| `chart` | `"bar"` \| `"line"` \| `"pie"` \| `"donut"` |
| `unit` | optional, ≤ `UNIT_MAX`; meaningful for `bar`/`line` only (ignored for pie/donut if sent) |
| `data` | For `bar`/`line`: 1…`COMPOSITE_CHART_SERIES_MAX` points `{ label, value }` (finite value, label ≤ `LABEL_MAX`). For `pie`/`donut`: 1…`PIE_MAX` slices, value ≥ 0. |

Nested charts do **not** carry their own `title`.

### Cross-field rules (`superRefine`)

1. Among `blocks`, number of `type === "image"` ≤ 1  
2. Among `blocks`, number of `type === "chart"` ≤ 1  
3. Multiple `text` blocks are allowed (within total block cap)  
4. Chart `data` length/sign rules as above (same style as solo pie refine)

Empty `blocks` is rejected by `.min(1)`.

## Limits (additions to `src/limits.ts`)

| Constant | Value | Applies to |
|---|---|---|
| `COMPOSITE_BLOCKS_MAX` | 4 | `blocks.length` |
| `COMPOSITE_TEXT_BULLETS_MAX` | 6 | bullets per text block |
| `COMPOSITE_CHART_SERIES_MAX` | 12 | bar/line points inside composite (smaller region than full slide) |
| `IMAGE_URL_MAX` | 2048 | image URL length |
| `IMAGE_ALT_MAX` | 80 | optional alt text |

Reuse: `TITLE_MAX`, `LABEL_MAX`, `UNIT_MAX`, `BULLET_MAX`, `PIE_MAX`, `BODY_BYTES_MAX`.

Rationale: nested bar with 90 points is unreadable in a half-frame; 12 keeps
density similar to original solo bar design intent. Pie keeps `PIE_MAX` (8).

## Layout rules (renderer)

Content region: same band as other slides (`CONTENT_TOP` … `CONTENT_BOTTOM`,
horizontal padding `CANVAS.pad`). Title + accent rule stay in `frame()`.

### `stack` (default)

- Blocks laid out **top → bottom** in array order, each full content width.
- Vertical split of the content height is **proportional by block kind**, then
  normalized to sum to 1:
  - `image` weight **2**
  - `chart` weight **2**
  - `text` weight **1**
- Gap between bands: 16px (fixed).
- Within a band: 8px inset from band edges for text/chart; image uses the band
  as the image viewport.

### `split`

- Content area is two columns, **equal width**, 24px gutter in the middle.
- **Partition:** first `ceil(n / 2)` blocks → **left** column (stacked top→bottom);
  remaining blocks → **right** column (stacked).  
  Examples: 1 block → left only (right empty, left uses full width? **No** —
  special-case: if `blocks.length === 1`, ignore split and render as stack full
  width). For n=2: L=[0], R=[1]. For n=3: L=[0,1], R=[2]. For n=4: L=[0,1], R=[2,3].
- Within each column, same weight-based vertical split as stack (weights only
  among that column’s blocks).
- If a column has zero blocks (should not happen for n≥2), skip drawing that
  column.

### Image rendering

```xml
<image href="{escapedUrl}" x="…" y="…" width="…" height="…"
       preserveAspectRatio="xMidYMid meet"
       class="block-image"/>
```

- Escape XML special characters in `url` and `alt` like other text.
- Use `href` (SVG2). Optional `alt` may be emitted as `<title>` inside a group
  for accessibility if easy; not required for v1 tests.
- Broken / blocked remote images: browser shows empty region — **no** server
  fallback. Acceptable for v1.

### Text rendering

- Bullet list: disc or `•` prefix, theme `fg` / `muted`, size from theme
  (slightly smaller than full-slide text if needed to fit).
- Truncation: validation caps length; renderer still XML-escapes.

### Chart rendering

- Draw into the assigned region’s plot box (leave ~24px legend/label margin
  inside the band when needed).
- Visual language must match solo charts (same `theme.series` colors, similar
  geometry). Prefer shared helpers over a second styling language.
- For pie/donut in a small box: prefer side legend only if space ≥ threshold;
  otherwise slices without legend labels beyond 4 items is ok if solo pie
  already handles density — keep simple: always try compact legend under or
  beside ring.

## MCP

| Tool | `slideType` | Input |
|---|---|---|
| `present_composite` | `composite` | `title`, optional `layout`, `blocks` (same shape as REST) |

Description must state: 1–4 blocks; at most one image and one chart; image URLs
must be `https://`; nested charts are bar/line/pie/donut only; series max 12.

`clear_deck` unchanged. No protocol change — new entry in `TOOL_DEFINITIONS`.

## API / OpenAPI / errors

- REST: `SlideInput` union expands; invalid composite → existing `400`
  validation mapping (`VALIDATION_FAILED` / path messages from Zod).
- OpenAPI: register `CompositeSlide` via `.openapi("CompositeSlide")` and block
  schemas as needed.
- WebSocket: no change (`init` / `slide` / keepalive).
- No CSP change required in v1 if viewer already allows loading the page; remote
  images are loaded by the browser from the SVG. If a future CSP blocks external
  images, that is a separate change — document in README that images depend on
  the browser being able to reach the URL (CORS/hotlink are the agent’s problem).

## Error handling (validation examples)

| Input | Result |
|---|---|
| 0 blocks | reject |
| 5 blocks | reject |
| 2 image blocks | reject |
| 2 chart blocks | reject |
| `url: "http://…"` | reject |
| `url: "data:image/png;base64,…"` | reject |
| bar `data` length 13 | reject |
| pie negative value | reject |
| unknown `chart: "scatter"` | reject |
| `layout: "grid"` | reject |

## Testing strategy

1. **Schema** — accept valid stack/split fixtures; reject all rows in the error
   table above; accept two text blocks + one image; accept chart-only composite.
2. **Render** — `renderSlide(composite)` returns SVG containing:
   - `class="block-image"` and the https URL when an image block is present
   - bullet text content for text blocks
   - chart structural markers (e.g. `class="bar"` / pie `class="slice"` / line
     polyline) for nested charts
   - both themes produce non-empty SVG
3. **MCP** — `tools/list` includes `present_composite`; `tools/call` pushes a
   composite slide that appears in deck list.
4. **Regression** — existing types unchanged.

## Docs

- README: add `composite` row to slide type table; list `present_composite`; note
  https-only images and block caps.
- This design does **not** lift the parent non-goal of “image upload / file
  attachments”; it only allows **remote https URLs** referenced by the agent.

## Rollout

Single implementation plan / PR is fine. No feature flag. Old cached `render.js`
may show “Unsupported slide” until refresh — same as prior type additions.

## Success criteria

- `composite` validates via Zod and renders pure SVG under dark and light themes
- `present_composite` works end-to-end in vitest
- Caps enforced: ≤4 blocks, ≤1 image, ≤1 chart, https-only URLs
- Nested bar/line/pie/donut render inside stack and split layouts
- No new npm dependencies; no server image fetch
- `npm test` green; existing slide types unchanged
- README lists `composite` accurately

## Resolved defaults (filled when user approved Approach 1 + §1)

These were specified here without further Q&A so implementation can proceed:

- Vertical weights image:chart:text = 2:2:1  
- Split partition = first `ceil(n/2)` left, rest right; n=1 → stack full width  
- Nested series max 12 (not full `SERIES_MAX` 90)  
- Type name `composite`, tool `present_composite`  
- Optional `layout` omitted ⇒ stack  
