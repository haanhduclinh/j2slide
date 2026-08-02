# j2slide — Design

Date: 2026-08-02
Status: Approved

## 1. Purpose

j2slide turns HTTP requests into a live slide deck. An AI agent calls a tool with
JSON — chart type, title, data points — and the slide appears immediately on every
browser that has the deck's view link open.

The intended use is an AI agent narrating a topic while pushing supporting visuals
to a shared screen: as the agent speaks, it calls the presentation tool.

The API surface is deliberately tiny and fully described by an OpenAPI document, so
any agent framework can ingest it as tools without glue code. An MCP endpoint wraps
the same logic for MCP-native clients.

## 2. Scope

### In scope

- Five fixed slide types: `bar`, `line`, `pie`, `text`, `kpi`
- One fixed 16:9 slide frame that every slide type renders into
- Deck registration returning a secret write key plus a public view id
- Real-time push to all viewers over WebSocket
- Deck navigation and history in the viewer
- `/openapi.json` + Swagger UI at `/docs`
- MCP Streamable HTTP endpoint

### Non-goals

- User accounts, email, passwords, or any identity beyond the deck key pair
- Editing or deleting an individual slide after it is pushed
- Image upload, file attachments, or arbitrary HTML in slides
- PDF/PPTX export
- Multiple concurrent presenters writing to one deck with conflict resolution
- Tables, maps, scatter plots, or any slide type beyond the five above
- Localisation of the viewer UI

## 3. Slide frame

Every slide renders into the same logical canvas of **1600×900 (16:9)**, scaled to
fit the viewport with letterboxing. The frame is identical across all five types:

```
┌──────────────────────────────────────────────┐  safe area: 64px inset
│  Revenue by quarter                          │  title: 56px, bold, single line
│  ──────                                      │  accent rule: 4px
│                                              │
│              [ CONTENT AREA ]                │  fills remaining space
│                                              │
│                                              │
│  ● live                               3 / 7  │  footer: 24px, 60% opacity
└──────────────────────────────────────────────┘
```

- Title is clamped to a single line; overflow is ellipsised. Length limits in the
  schema make this rare rather than routine.
- Footer left shows connection state (`● live`, `○ reconnecting`), footer right
  shows position in the deck.
- Dark theme is the default; `T` toggles light. The choice persists in
  `localStorage`.
- Fonts come from the system font stack. No web fonts, no CDN requests — the viewer
  must work on a locked-down network.
- Slide transition: 250ms fade plus a small upward translate.

### Rendering approach

Charts are rendered as hand-written SVG. No charting library.

The reasons: there are only five slide types, the whole point of the project is
absolute control over one fixed frame, and a zero-dependency viewer avoids CSP and
CDN problems entirely.

Each type is a **pure function** `renderX(slide, theme) -> SVG string`. Purity is a
deliberate testability decision: chart output can be asserted in unit tests without
a browser or a DOM.

### Per-type layout

| type | layout |
|---|---|
| `bar` | Vertical bars on a horizontal baseline. Value label above each bar, category label below. Category labels rotate 45° when there are more than 8 bars. |
| `line` | Polyline with a dot at each point, faint horizontal grid lines, y-axis labelled at min/mid/max. |
| `pie` | Donut. Legend on the right listing label, value and computed percentage. |
| `text` | Title plus bullet list. Bullet font size scales down as bullet count rises. |
| `kpi` | 1–4 tiles in a row. Large value, label beneath, optional delta with an up/down arrow (up green, down red, flat neutral). |

Colour palette and typography tokens live in one module (`theme.js`) shared by all
renderers, so the deck reads as one visual system.

## 4. Data contract

The schema limits below are the core of the design. They exist so the fixed frame
**cannot** be broken by input, and so an agent reading the tool schema knows the
limits before it calls.

| type | constraints |
|---|---|
| all | `title` ≤ 80 chars, request body ≤ 32 KB |
| `bar`, `line` | 1–12 data points, `label` ≤ 24 chars, `value` finite number, optional `unit` ≤ 8 chars |
| `pie` | 1–8 slices, `label` ≤ 24 chars, `value` ≥ 0 (agent aggregates a "Other" slice itself if it has more) |
| `text` | 1–8 bullets, each ≤ 120 chars |
| `kpi` | 1–4 items; `label` ≤ 24 chars, `value` ≤ 12 chars, optional `delta` ≤ 10 chars with `trend` of `up`/`down`/`flat` |

### Single source of truth

Zod schemas in `src/schemas.ts` are the only definition of slide shape. They drive
three things that must never drift apart:

1. Request validation for the REST routes
2. The generated `/openapi.json` (via `@hono/zod-openapi`)
3. MCP tool input schemas (via `zod-to-json-schema`)

A validation failure returns HTTP 400 with per-field messages, phrased so an agent
can correct itself and retry:

```json
{
  "error": "validation_failed",
  "details": [
    { "path": "data", "message": "Expected at most 12 items, received 19" },
    { "path": "title", "message": "Expected at most 80 characters, received 132" }
  ]
}
```

### Slide payload examples

```json
{ "type": "bar",  "title": "Revenue by quarter",
  "unit": "M USD",
  "data": [ {"label":"Q1","value":12.4}, {"label":"Q2","value":15.1} ] }

{ "type": "pie",  "title": "Market share",
  "data": [ {"label":"Us","value":34}, {"label":"Them","value":66} ] }

{ "type": "text", "title": "What we found",
  "bullets": ["Churn dropped 12%", "Cost per lead is flat"] }

{ "type": "kpi",  "title": "This month",
  "items": [ {"label":"Revenue","value":"12.4M","delta":"34%","trend":"up"} ] }
```

## 5. Architecture

```
AI agent ──POST /decks/{id}/slides──┐
         Authorization: Bearer sk_… │
                                    ▼
                          Worker (Hono, TypeScript)
                                    │  env.DECK.get(idFromName(deck_id))
                                    ▼
                         DeckDO — one Durable Object per deck
                          ├─ storage: meta + slide:000001 …
                          └─ broadcast over hibernatable WebSockets
                                    │
                    ┌───────────────┼───────────────┐
                 viewer1         viewer2         viewer3
```

**There is no KV and no D1.** The `deck_id` *is* the Durable Object name, and the
hash of the deck's API key lives inside that same Durable Object. This removes the
lookup table that would otherwise sit on the hot path of every write, and removes
an eventual-consistency store from a system whose whole promise is immediacy.

### Runtime

- Cloudflare Workers, TypeScript, [Hono](https://hono.dev) for routing
- `@hono/zod-openapi` for schema-driven routes and OpenAPI generation
- One Durable Object class, `DeckDO`, using the **WebSocket Hibernation API** so an
  idle deck with viewers attached is not billed for wall-clock duration
- Viewer static assets served through Workers Static Assets from `public/`
- **Requires the Workers Paid plan** (~$5/month) — Durable Objects are not available
  on the free plan. This is a direct consequence of choosing real-time push.

### Identifiers

- `deck_id`: 32 hex characters from `crypto.getRandomValues` (16 random bytes)
- `api_key`: `sk_` followed by 32 hex characters from the same source

The brief described the view code as "a random MD5". The format here is identical in
appearance — 32 hex characters — but the bytes are drawn from a CSPRNG rather than
produced by hashing something. MD5 is unsuitable for a security token: it is fast to
compute and collision-broken, and hashing a guessable input would make the code
guessable.

The API key is returned **exactly once**, at deck creation. Only its SHA-256 digest
is stored. Verification uses a constant-time comparison.

## 6. HTTP API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/decks` | none | Create a deck; returns the key pair. Rate limited by IP. |
| `POST` | `/decks/{deck_id}/slides` | Bearer | Push one slide; broadcasts it. |
| `GET` | `/decks/{deck_id}/slides` | Bearer | List current slides (lets an agent inspect deck state). |
| `DELETE` | `/decks/{deck_id}/slides` | Bearer | Clear all slides; starts a new session. |
| `GET` | `/d/{deck_id}` | none | Viewer HTML page. |
| `GET` | `/d/{deck_id}/ws` | none | WebSocket upgrade for the viewer. |
| `GET` | `/openapi.json` | none | OpenAPI 3.1 document. |
| `GET` | `/docs` | none | Swagger UI. |
| `ALL` | `/mcp/{deck_id}` | Bearer | MCP Streamable HTTP endpoint. |

`POST /decks` response:

```json
{
  "deck_id":  "7b2e4c91a0f34d5e8c1b6a2f9d0e3c47",
  "api_key":  "sk_9f31c0a7e5b84d2196f0ac3b7d5e1284",
  "view_url": "https://j2slide.example.workers.dev/d/7b2e4c91a0f34d5e8c1b6a2f9d0e3c47",
  "mcp_url":  "https://j2slide.example.workers.dev/mcp/7b2e4c91a0f34d5e8c1b6a2f9d0e3c47",
  "warning":  "api_key is shown only once. Store it now."
}
```

`POST /decks/{deck_id}/slides` response: `{ "seq": 7, "index": 6, "total": 7 }`.

### MCP tools

The MCP endpoint is a thin wrapper over the same handlers, exposing:

`present_bar`, `present_line`, `present_pie`, `present_text`, `present_kpi`,
`clear_deck`

Tool input schemas are generated from the same Zod definitions. Each `present_*`
tool returns a short text confirmation including the slide's position in the deck,
so the agent can reason about what is currently on screen.

The deck is bound to the endpoint URL (`/mcp/{deck_id}`) with the key in the
`Authorization` header, so an agent configures one MCP server and never has to pass
credentials as tool arguments.

## 7. Durable Object

### Storage layout

| key | value |
|---|---|
| `meta` | `{ apiKeyHash, createdAt, lastActiveAt, nextSeq, firstSeq, count }` |
| `slide:{seq padded to 6}` | `{ seq, type, title, …payload, createdAt }` |

`nextSeq` is monotonic and never resets, so a slide's identity is stable even after
older slides are evicted.

### WebSocket protocol

Server to client only; the client never sends application messages.

```
{ "type": "init",  "slides": [...], "liveIndex": 6 }
{ "type": "slide", "slide": {...},  "index": 7 }
{ "type": "clear" }
```

On connect the DO accepts the socket via `state.acceptWebSocket()` (hibernation),
then sends `init` with the full current deck. On a push it appends the slide to
storage and fans `slide` out to every attached socket. Sockets that fail to send are
discarded.

### Limits and cleanup

- **Rate limit:** token bucket in the DO, 60 slides per minute per deck. Exceeding
  it returns 429 with `Retry-After`. This stops a looping agent from flooding a
  live presentation.
- **Deck cap:** 200 slides. Beyond that the oldest slide is deleted on each write
  and `firstSeq` advances.
- **Expiry:** every write sets a DO alarm for `now + 7 days`. When the alarm fires,
  all slides are deleted. `meta` — and therefore `deck_id` and `api_key` — survives,
  so a configured agent keeps working after an idle period.

## 8. Viewer behaviour

On load the page opens the WebSocket and renders the deck from `init`.

**Auto-advance is conditional.** When a new slide arrives, the viewer jumps to it
only if the viewer was already sitting on the last slide. If the person has pressed
`←` to look back at an earlier slide, they are not yanked forward; instead a badge
appears reading `▼ 2 new slides`, and clicking it or pressing `End` jumps to live.
This preserves the approved auto-advance behaviour without stealing control from
someone who deliberately navigated away.

Controls:

| key | action |
|---|---|
| `←` / `→` / `Space` | previous / next slide |
| `End` | jump to the live slide |
| `F` | fullscreen |
| `T` | toggle theme |

On disconnect the footer switches to `○ reconnecting` and the socket retries with
exponential backoff (1s, 2s, 4s, capped at 15s). On reconnect the viewer re-syncs
from a fresh `init` rather than trying to replay missed messages.

An empty deck shows a neutral standby slide with the deck id, so a presenter can
confirm the right link is open before anything is pushed.

## 9. Error handling

| status | condition | body `error` |
|---|---|---|
| 400 | Zod validation failure | `validation_failed` with `details[]` |
| 401 | Missing or malformed `Authorization` header | `unauthorized` |
| 403 | Key does not match this deck | `forbidden` |
| 404 | Deck was never created | `deck_not_found` |
| 413 | Body over 32 KB | `payload_too_large` |
| 429 | Rate limit exceeded | `rate_limited` (with `Retry-After`) |

Deck creation is rate limited per IP (10 per hour) using Cloudflare's Workers rate
limiting binding. If that binding is unavailable at implementation time, the
fallback is a single `RateLimiterDO` keyed by a hash of the client IP — this is the
one item in the design that needs verification against the platform during
implementation.

Deck existence is not treated as a secret: `deck_id` is the public half of the key
pair and `GET /d/{deck_id}` already reveals it. So `404 deck_not_found` is returned
plainly, and `403` is only ever reached by a caller presenting a syntactically valid
key that does not match the deck.

## 10. Project structure

```
src/
  index.ts          # Hono app, route wiring, DO export
  schemas.ts        # Zod slide schemas — single source of truth
  auth.ts           # key generation, SHA-256 hashing, constant-time verify
  deck-do.ts        # DeckDO: storage, rate limit, alarm, WS broadcast
  routes/
    decks.ts        # create, push, list, clear
    mcp.ts          # MCP Streamable HTTP wrapper
    viewer.ts       # viewer HTML shell + WS upgrade
public/
  viewer.css
  viewer.js         # WS client, deck navigation, keyboard
  render.js         # renderBar/renderLine/renderPie/renderText/renderKpi
  theme.js          # palette + typography tokens
test/
wrangler.jsonc
```

Each module has one job. `render.js` in particular must stay free of DOM access so
its functions remain pure and testable.

## 11. Testing

Vitest with `@cloudflare/vitest-pool-workers`, so Durable Objects run in real
workerd rather than a mock.

- **Auth:** missing header, malformed header, wrong key, correct key, key from a
  different deck
- **Validation:** each documented limit, at the boundary and one past it, for all
  five slide types; oversized body
- **Durable Object:** slides survive a DO restart; `nextSeq` stays monotonic across
  evictions; the 200-slide cap evicts oldest first; the alarm clears slides but
  keeps `meta`
- **Broadcast:** two attached sockets both receive a pushed slide; a socket
  attaching mid-session receives the full deck in `init`
- **Rate limit:** the 61st slide within a minute returns 429
- **Clear:** `DELETE` empties the deck and broadcasts `clear`
- **Rendering:** snapshot tests of the SVG output of all five renderers, including
  the edge cases the limits allow (1 data point, 12 data points, longest permitted
  labels)
- **OpenAPI:** the generated document validates, and every documented limit appears
  in it — this is what guarantees an agent can see the constraints

## 12. Conventions

All code, comments, identifiers, commit messages and documentation in this
repository are written in English.
