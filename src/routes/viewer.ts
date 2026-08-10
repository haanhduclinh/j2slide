import { Hono } from "hono";
import { deckStub } from "../deck-stub";
import type { Env } from "../index";

const DECK_ID = /^[0-9a-f]{32}$/;

export const viewerRoutes = new Hono<{ Bindings: Env }>();

viewerRoutes.get("/d/:deckId", async (c) => {
  const deckId = c.req.param("deckId");
  if (!DECK_ID.test(deckId)) return c.text("Not Found", 404);

  if (!(await deckStub(c.env, deckId).exists())) return c.text("Not Found", 404);

  return c.html(page(deckId));
});

viewerRoutes.get("/d/:deckId/ws", async (c) => {
  const deckId = c.req.param("deckId");
  if (!DECK_ID.test(deckId)) return c.text("Not Found", 404);
  return deckStub(c.env, deckId).fetch(c.req.raw);
});

/** The deck id is the only thing injected; the api key never reaches a viewer. */
function page(deckId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>j2slide</title>
<link rel="stylesheet" href="/viewer.css">
</head>
<body data-deck-id="${deckId}">
<main id="stage" aria-live="polite"></main>
<button id="jump" hidden></button>
<script type="module" src="/viewer.js"></script>
</body>
</html>`;
}
