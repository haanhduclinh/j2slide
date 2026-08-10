# j2slide

Push chart JSON over HTTP; the slide appears immediately on every open viewer.

Built for AI agents: while the agent talks, it calls a presentation tool and the
audience sees the supporting chart on a shared screen.

## How it works

1. `POST /decks` returns an `api_key` (secret, for the agent) and a `deck_id`
   (public, for the audience).
2. Share `https://<host>/d/<deck_id>`. Anyone with the link can watch; nobody
   with the link can write.
3. The agent pushes slides with the `api_key`. Every open viewer updates at once.

The `api_key` is shown exactly once. Only its SHA-256 digest is stored.

## Slide types

`bar`, `line`, `pie`, `text`, `kpi`. Each has hard size limits so the fixed
16:9 frame cannot be broken by input — see `/docs` for the exact bounds.

## Quick start

```bash
npm install
npm run dev
```

```bash
# Create a deck
curl -s -X POST http://localhost:8787/decks

# Push a slide
curl -s -X POST http://localhost:8787/decks/<deck_id>/slides \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"type":"bar","title":"Revenue by quarter","unit":"M USD",
       "data":[{"label":"Q1","value":12.4},{"label":"Q2","value":15.1}]}'

# Start a new session
curl -s -X DELETE http://localhost:8787/decks/<deck_id>/slides \
  -H "Authorization: Bearer <api_key>"
```

Open `http://localhost:8787/d/<deck_id>` to watch.

## Connecting an agent

**OpenAPI** — point any agent framework at `/openapi.json`. Every limit is
published in the schema, so the model sees the constraints before it calls.

**MCP** — add the server as Streamable HTTP:

```json
{
  "mcpServers": {
    "j2slide": {
      "url": "https://<host>/mcp/<deck_id>",
      "headers": { "Authorization": "Bearer <api_key>" }
    }
  }
}
```

Tools: `present_bar`, `present_line`, `present_pie`, `present_text`,
`present_kpi`, `clear_deck`.

## Viewer controls

| Key | Action |
|---|---|
| `←` `→` `Space` | previous / next slide |
| `End` | jump to the live slide |
| `F` | fullscreen |
| `T` | toggle dark/light |

A new slide auto-advances the viewer only if they are already on the last
slide. If they have navigated back, a `▼ n new slides` badge appears instead.

## Limits

- 60 slides per minute per deck
- 200 slides per deck; the oldest is evicted beyond that
- 32 KB per request
- Slides are deleted after 7 days of inactivity; the deck and its key survive

## Deploying

Requires the **Cloudflare Workers Paid plan** — Durable Objects are not
available on the free plan.

```bash
npx wrangler login
npm run deploy
```

## Development

```bash
npm test          # full suite
npm run test:watch
npm run typecheck
```
