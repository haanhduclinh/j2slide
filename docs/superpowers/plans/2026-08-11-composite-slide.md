# Composite Slide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `composite` slide type with ordered `blocks[]` of `image` | `text` | `chart` (bar/line/pie/donut), layout `stack` | `split`, https image URLs, pure SVG render, MCP `present_composite`.

**Architecture:** Zod `CompositeSlide` joins the existing `SlideInput` union with superRefine caps. Viewer gains `public/renderers/composite.js` that partitions regions and draws image/text/chart bodies. No DO/WS/auth changes; no server image fetch.

**Tech Stack:** TypeScript, Zod via `@hono/zod-openapi`, Cloudflare Workers, Vitest, hand-written SVG.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-composite-slide-design.md`
- Pure SVG only; no new npm deps
- Image: `https://` only, browser `<image href>`
- Caps: 1–4 blocks; ≤1 image; ≤1 chart; nested series max 12; text bullets max 6 per text block
- Nested charts: bar | line | pie | donut only
- Match existing patterns in `schemas.ts`, `mcp-schemas.ts`, modular renderers

## File map

| Path | Action |
|---|---|
| `src/limits.ts` | Add COMPOSITE_* and IMAGE_* constants |
| `src/schemas.ts` | CompositeSlide + blocks + refine + union |
| `src/mcp-schemas.ts` | present_composite + SlideType |
| `public/renderers/composite.js` | Create layout + block render |
| `public/render.js` | Import + register composite |
| `test/schemas.test.ts` | Composite accept/reject |
| `test/render.test.ts` | Composite SVG asserts |
| `test/mcp.test.ts` | Tool list + call |
| `README.md` | Document type + tool |

---

### Task 1: Limits + Zod schema (TDD)

**Files:**
- Modify: `src/limits.ts`
- Modify: `src/schemas.ts`
- Test: `test/schemas.test.ts`

**Interfaces:**
- Produces: `CompositeSlide` in `SlideInput`; constants on `L`

- [ ] **Step 1: Write failing schema tests**

Append to `test/schemas.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run test/schemas.test.ts
```

- [ ] **Step 3: Add limits**

In `src/limits.ts` add:

```ts
  COMPOSITE_BLOCKS_MAX: 4,
  COMPOSITE_TEXT_BULLETS_MAX: 6,
  COMPOSITE_CHART_SERIES_MAX: 12,
  IMAGE_URL_MAX: 2048,
  IMAGE_ALT_MAX: 80,
```

- [ ] **Step 4: Add Zod schemas**

In `src/schemas.ts`:

- `ImageBlock`, `TextBlock` (composite), `ChartBlock` with discriminated data by chart kind OR single chart block with refine
- Prefer:

```ts
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

const seriesPointData = z.array(Point).min(1).max(L.COMPOSITE_CHART_SERIES_MAX);
const pieData = z.array(PieSlice).min(1).max(L.PIE_MAX);

export const ChartBlock = z.discriminatedUnion("chart", [
  z.object({ type: z.literal("chart"), chart: z.literal("bar"), unit: z.string().max(L.UNIT_MAX).optional(), data: seriesPointData }),
  z.object({ type: z.literal("chart"), chart: z.literal("line"), unit: z.string().max(L.UNIT_MAX).optional(), data: seriesPointData }),
  z.object({ type: z.literal("chart"), chart: z.literal("pie"), data: pieData }),
  z.object({ type: z.literal("chart"), chart: z.literal("donut"), data: pieData }),
]).openapi("ChartBlock");

export const CompositeBlock = z.discriminatedUnion("type", [
  ImageBlock, CompositeTextBlock, ChartBlock,
]); // ChartBlock is already a union — if Zod rejects nesting, use z.union([ImageBlock, CompositeTextBlock, ...flat chart variants])

export const CompositeSlide = z.object({
  type: z.literal("composite"),
  title,
  layout: z.enum(["stack", "split"]).optional(),
  blocks: z.array(CompositeBlock).min(1).max(L.COMPOSITE_BLOCKS_MAX),
}).openapi("CompositeSlide");
```

If `discriminatedUnion` cannot nest `ChartBlock` (also a DU), flatten:

```ts
blocks: z.array(z.union([
  ImageBlock,
  CompositeTextBlock,
  z.object({ type: z.literal("chart"), chart: z.literal("bar"), ... }),
  // line, pie, donut
])).min(1).max(L.COMPOSITE_BLOCKS_MAX)
```

Add `CompositeSlide` to `SlideInput` members. In `superRefine`:

```ts
  if (val.type === "composite") {
    const images = val.blocks.filter((b) => b.type === "image").length;
    const charts = val.blocks.filter((b) => b.type === "chart").length;
    if (images > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "at most one image block", path: ["blocks"] });
    }
    if (charts > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "at most one chart block", path: ["blocks"] });
    }
  }
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run test/schemas.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/limits.ts src/schemas.ts test/schemas.test.ts
git commit -m "feat: zod schema for composite slides with image/text/chart blocks"
```

---

### Task 2: MCP tool

**Files:**
- Modify: `src/mcp-schemas.ts`
- Test: `test/mcp.test.ts`

- [ ] **Step 1: Extend tests** — add `present_composite` to sorted tool list; assert `blocks.maxItems === L.COMPOSITE_BLOCKS_MAX`; tools/call happy path with minimal composite.

- [ ] **Step 2: Implement** — add JSON Schema for composite input mirroring Zod; `SlideType` includes `"composite"`; `TOOL_DEFINITIONS` entry `present_composite`.

- [ ] **Step 3: Run** `npx vitest run test/mcp.test.ts` — PASS

- [ ] **Step 4: Commit** `feat: MCP present_composite tool`

---

### Task 3: Renderer

**Files:**
- Create: `public/renderers/composite.js`
- Modify: `public/render.js` (register only)
- Test: `test/render.test.ts`

**Produces:** `export function renderComposite(slide, theme)` returning body SVG fragment (no outer `<svg>` — `frame()` wraps it like other modular renderers).

Check donut/table: they return body only or full? Looking at frame() - `renderer(slide, theme)` is body inside frame. Yes.

- [ ] **Step 1: Failing render tests**

```ts
  it("renders composite with image href, bullets, and bar marks", () => {
    const svg = render({
      type: "composite",
      title: "Combo",
      layout: "stack",
      blocks: [
        { type: "image", url: "https://cdn.example.com/a.png" },
        { type: "text", bullets: ["alpha", "beta"] },
        { type: "chart", chart: "bar", data: [{ label: "Q1", value: 3 }] },
      ],
    });
    expect(svg).toContain('class="block-image"');
    expect(svg).toContain("https://cdn.example.com/a.png");
    expect(svg).toContain("alpha");
    expect(svg).toMatch(/class="bar"/);
  });

  it("renders composite split without throwing for two blocks", () => {
    const svg = render({
      type: "composite",
      title: "Split",
      layout: "split",
      blocks: [
        { type: "text", bullets: ["left"] },
        { type: "chart", chart: "line", data: [{ label: "a", value: 1 }, { label: "b", value: 2 }] },
      ],
    });
    expect(svg).toContain("left");
    expect(svg).toContain("polyline");
  });

  it("escapes image url xml specials", () => {
    const svg = render({
      type: "composite",
      title: "T",
      blocks: [{ type: "image", url: "https://cdn.example.com/a&b.png?x=1&y=2" }],
    });
    expect(svg).toContain("a&amp;b.png");
  });
```

Also add composite to the “every slide type” 1600x900 list.

- [ ] **Step 2: Implement `renderComposite`**

Layout algorithm per spec:

1. `layout = slide.layout ?? "stack"`; if `blocks.length === 1`, force stack full width.
2. Build columns: stack → one column all blocks; split → left `blocks.slice(0, ceil(n/2))`, right rest.
3. For each column, region rects with weights image=2, chart=2, text=1; gap 16px.
4. Draw:
   - image: `<image class="block-image" href="..." x y width height preserveAspectRatio="xMidYMid meet"/>` using `esc(url)`
   - text: bullets with accent dots in box
   - chart: compact bar/line/pie/donut into box (local geometry; reuse `n`, `text`, `formatValue`, `theme.series`)

- [ ] **Step 3: Wire `import { renderComposite } from "./renderers/composite.js"` and `composite: renderComposite` in RENDERERS**

- [ ] **Step 4: Tests pass** `npx vitest run test/render.test.ts`

- [ ] **Step 5: Commit** `feat: pure SVG composite slide renderer`

---

### Task 4: Docs + full suite

- [ ] Update README slide table + MCP list + short composite curl example
- [ ] `npm test` all green
- [ ] Commit `docs: document composite slides`

## Success criteria (from spec)

- [ ] composite validates + renders dark/light
- [ ] present_composite e2e in vitest
- [ ] caps enforced
- [ ] no new deps / no server image fetch
- [ ] existing types unchanged
