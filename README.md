# j2slide

**Live presentation slides for AI agents.**

Push chart JSON over HTTP or MCP — the slide appears immediately on every open
viewer. Built for demos where an agent talks while the audience watches charts
on a shared screen.

| | |
|---|---|
| **Live demo** | [https://j2slide.haanhduclinh.workers.dev](https://j2slide.haanhduclinh.workers.dev) |
| **API docs** | [Swagger UI](https://j2slide.haanhduclinh.workers.dev/docs) · [OpenAPI](https://j2slide.haanhduclinh.workers.dev/openapi.json) |
| **License** | [MIT](./LICENSE) |
| **Stack** | Cloudflare Workers · Durable Objects · Hono · pure SVG (no chart library) |

```bash
# Create a deck on the public demo
curl -s -X POST https://j2slide.haanhduclinh.workers.dev/decks
```

Save the `api_key` (shown once). Open `view_url` in a browser, then push slides
with the key — the viewer updates in real time.

---

## Why j2slide?

Most agent UIs dump text or static images. j2slide is a **shared live deck**:

1. Create a deck → get a **write key** (agent) and a **public view link** (audience).
2. The agent posts slides (`bar`, `line`, `pie`, `text`, `kpi`, `table`, `area`, `stacked_bar`, `scatter`, `donut`, `composite`) over REST or MCP.
3. Every open viewer receives the slide over a hibernatable WebSocket.

No accounts, no client-side chart libraries, no CDN for the app itself. The
viewer is vanilla JS and pure SVG. Chart slides render offline from JSON;
`composite` **image** blocks load remote `https://` URLs in the browser (the
server never fetches them), so those slides need network access to the image host.

---

## How it works

```
  Agent (REST / MCP)                    Audience browser
        │                                      │
        │  Authorization: Bearer sk_…          │  GET /d/<deck_id>
        ▼                                      ▼
   ┌─────────────────────────────────────────────────┐
   │              Cloudflare Worker (Hono)           │
   │  /decks  /mcp/:id  /openapi.json  /d/:id        │
   └──────────────────────┬──────────────────────────┘
                          │ one Durable Object per deck
                          ▼
                   ┌─────────────┐
                   │   DeckDO    │  SQLite storage
                   │  slides +   │  rate limit · expiry
                   │  key hash   │  WebSocket fan-out
                   └─────────────┘
```

- **`deck_id`** — public, 32 hex chars. Safe to share in a URL.
- **`api_key`** — secret (`sk_` + 32 hex). Shown once at create time; only the
  SHA-256 digest is stored. Required for every write.
- **Viewers never hold the key.** The view URL is read-only.

---

## Slide types

| Type | Payload |
|------|---------|
| `bar` | Series of labeled values (optional unit) |
| `line` | Same series shape as bar |
| `pie` | Named slices (non-negative values) |
| `text` | Title + bullet list |
| `kpi` | Up to 4 KPI tiles (value, optional delta / trend) |
| `table` | `columns[]` + `rows[][]` (string cells; each row matches column count) |
| `area` | Multi-series: `categories[]` + `series[{ name, values[] }]` (overlaid fills) |
| `stacked_bar` | Same multi-series shape; values must be ≥ 0 |
| `scatter` | `points[{ x, y, label?, series? }]` + optional axis labels |
| `donut` | Same data shape as pie; ring with center total |
| `composite` | Ordered `blocks[]` of `image` (https URL) + `text` + `chart` (bar/line/pie/donut); optional `layout`: `stack` \| `split` |

Hard limits keep every chart inside a fixed **16:9** frame. Exact bounds are in
[`src/limits.ts`](./src/limits.ts) and published in `/openapi.json` so models see
constraints before calling.

**Multi-series example** (`stacked_bar` / `area`):

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

**Composite example** (image + bullets + nested bar; browser loads the image URL):

```json
{
  "type": "composite",
  "title": "Q3 product update",
  "layout": "split",
  "blocks": [
    { "type": "image", "url": "https://cdn.example.com/hero.png", "alt": "Product" },
    { "type": "text", "bullets": ["Revenue up 12%", "Churn flat"] },
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

Caps: 1–4 blocks; at most one `image` and one `chart`; image URLs must be `https://`.

---

## Quick start (local)

**Requirements:** Node.js 18+, npm. Deploy needs a [Cloudflare Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/)
plan (Durable Objects).

```bash
git clone https://github.com/haanhduclinh/j2slide.git
cd j2slide
npm install
npm run dev
```

Local default: `http://localhost:8787`

```bash
# Create a deck
curl -s -X POST http://localhost:8787/decks | jq

# Push a slide (replace <deck_id> and <api_key>)
curl -s -X POST http://localhost:8787/decks/<deck_id>/slides \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "bar",
    "title": "Revenue by quarter",
    "unit": "M USD",
    "data": [
      {"label": "Q1", "value": 12.4},
      {"label": "Q2", "value": 15.1}
    ]
  }' | jq

# Clear slides for a new session
curl -s -X DELETE http://localhost:8787/decks/<deck_id>/slides \
  -H "Authorization: Bearer <api_key>"
```

Open `http://localhost:8787/d/<deck_id>` to watch.

---

## Live demo

Hosted instance (same code as this repo):

**https://j2slide.haanhduclinh.workers.dev**

| Endpoint | Purpose |
|----------|---------|
| [`/docs`](https://j2slide.haanhduclinh.workers.dev/docs) | Swagger UI |
| [`/openapi.json`](https://j2slide.haanhduclinh.workers.dev/openapi.json) | Machine-readable API |
| [`/health`](https://j2slide.haanhduclinh.workers.dev/health) | Liveness |
| `/d/<deck_id>` | Live viewer |
| `/mcp/<deck_id>` | MCP Streamable HTTP |

The public demo is a shared sandbox. Do not put sensitive data on it. Deck
creation is open; treat it as best-effort and ephemeral.

---

## Connecting an agent

### OpenAPI

Point any tool-using agent framework at:

```text
https://j2slide.haanhduclinh.workers.dev/openapi.json
```

(or your own host). Limits are in the schema.

### MCP (Streamable HTTP)

1. Create a deck and keep `api_key` + `deck_id`.
2. Register the server:

```json
{
  "mcpServers": {
    "j2slide": {
      "url": "https://j2slide.haanhduclinh.workers.dev/mcp/<deck_id>",
      "headers": {
        "Authorization": "Bearer <api_key>"
      }
    }
  }
}
```

**Tools:** `present_bar`, `present_line`, `present_pie`, `present_text`,
`present_kpi`, `present_table`, `present_area`, `present_stacked_bar`,
`present_scatter`, `present_donut`, `present_composite`, `clear_deck`.

---

## Viewer controls

| Key | Action |
|-----|--------|
| `←` `→` / `Space` | Previous / next slide |
| `End` | Jump to the live (newest) slide |
| `F` | Toggle fullscreen |
| `T` | Toggle dark / light theme |

A new slide auto-advances only if the viewer is already on the latest slide.
If they navigated back, a `▼ n new slides` badge appears instead.

---

## Limits

| Limit | Value |
|-------|------:|
| Push rate | 60 slides / minute / deck |
| Deck size | 200 slides (oldest evicted) |
| Request body | 32 KB |
| Idle expiry | Slides deleted after **2 hours** without a successful push; deck + key hash kept |

---

## Project layout

```text
src/
  index.ts           App entry, health, 404
  limits.ts          Single source of truth for all caps
  schemas.ts         Zod slide schemas (+ OpenAPI metadata)
  mcp-schemas.ts     Hand-built MCP JSON Schema from limits
  auth.ts            Key gen, SHA-256, constant-time compare
  deck-do.ts         Durable Object: storage, rate limit, WS, alarm
  deck-stub.ts       Resolve deck_id → DO stub
  errors.ts          Error code → HTTP response
  routes/
    decks.ts         REST create / push / list / clear
    mcp.ts           MCP Streamable HTTP
    openapi.ts       OpenAPI document + Swagger UI
    viewer.ts        HTML shell + WebSocket upgrade
public/
  render.js          Frame + dispatcher; legacy bar/line/pie/text/kpi bodies
  renderers/         Modular pure SVG types (table, charts, composite, …)
  theme.js           Dark / light tokens
  viewer.js          WebSocket client, navigation
  viewer.css         Letterboxed 16:9 chrome
test/                Vitest + @cloudflare/vitest-pool-workers
```

Design notes:

- [`docs/superpowers/specs/2026-08-02-j2slide-design.md`](./docs/superpowers/specs/2026-08-02-j2slide-design.md) — core product
- [`docs/superpowers/specs/2026-08-11-more-chart-types-design.md`](./docs/superpowers/specs/2026-08-11-more-chart-types-design.md) — table / area / stacked_bar / scatter / donut
- [`docs/superpowers/specs/2026-08-11-composite-slide-design.md`](./docs/superpowers/specs/2026-08-11-composite-slide-design.md) — composite (image + text + chart)

---

## Deploy your own

Requires the **Cloudflare Workers Paid** plan (Durable Objects).

```bash
npx wrangler login    # once
npm test
npm run deploy
```

Config lives in [`wrangler.jsonc`](./wrangler.jsonc): Worker name `j2slide`,
SQLite Durable Object class `DeckDO`, static assets from `public/`.

Optional custom domain: Cloudflare Dashboard → Workers → **j2slide** →
**Domains & Routes**, or add `routes` / domains in Wrangler.

Redeploy after changes:

```bash
npm test && npm run deploy
```

---

## Development

```bash
npm test          # full suite (workers pool)
npm run test:watch
npm run typecheck
npm run cf-typegen   # regenerate worker-configuration.d.ts
```

Conventions:

- English for code, comments, commits, and docs.
- Import Zod only from `@hono/zod-openapi` (not bare `zod`).
- `public/render.js` must stay pure: data in → SVG string out, no DOM.
- Conventional Commits (`feat:`, `fix:`, `docs:`, …).

---

## Security model

| Concern | Behavior |
|---------|----------|
| Write auth | Bearer `api_key`; only SHA-256 stored server-side |
| Read access | Anyone with `/d/<deck_id>` can watch (by design) |
| Viewer XSS | Slide strings (and image URLs) XML-escaped in pure SVG renderers |
| Remote images | `composite` only accepts `https://` URLs; browser loads them directly — no server proxy; CORS/hotlink failures are empty regions |
| Payload size | 32 KB cap on REST and MCP |
| Abuse | Per-deck push rate limit (60/min); **no** IP rate limit on `POST /decks` yet |

**Known limitation for public internet:** deck creation is unauthenticated.
Self-hosters should add an IP (or similar) rate limit before heavy public use.
The hosted demo is a sandbox — do not store secrets or PII there.

---

## Code review notes (current tree)

Strengths:

- Clear split: REST / MCP / OpenAPI / viewer over one `DeckDO`.
- Limits centralized; OpenAPI + MCP tests assert published bounds.
- Auth uses CSPRNG ids, SHA-256 digests, timing-safe compare.
- Hibernatable WebSockets + pure SVG keep cost and dependencies low.
- 150 automated tests across storage, rate limit, WS, routes, MCP, render, OpenAPI.

Follow-ups worth knowing:

- IP rate limit on `POST /decks` before large-scale public exposure.
- Optional: re-arm expiry alarm on `clearSlides` (idle policy already self-heals).
- Dual `Env` typings (`src/index.ts` + `worker-configuration.d.ts`) could be unified.

---

## Contributing

Issues and pull requests are welcome.

1. Fork and branch from `master`.
2. Keep changes focused; match existing style and file layout.
3. Add or update tests for behavior changes.
4. Run `npm test` and `npm run typecheck` before opening a PR.
5. Use Conventional Commit messages.

---

## License

[MIT](./LICENSE) © 2026 haanhduclinh
