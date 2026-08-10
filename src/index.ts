import { Hono } from "hono";
import { deckRoutes } from "./routes/decks";
import { mcpRoutes } from "./routes/mcp";
import { openapiRoutes } from "./routes/openapi";
import { viewerRoutes } from "./routes/viewer";
import type { DeckDO } from "./deck-do";

export interface Env {
  DECK: DurableObjectNamespace<DeckDO>;
  ASSETS: Fetcher;
}

export { DeckDO } from "./deck-do";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ service: "j2slide", status: "ok" }));
app.route("/", deckRoutes);
app.route("/", mcpRoutes);
app.route("/", openapiRoutes);
app.route("/", viewerRoutes);

app.get("/", (c) => c.redirect("/docs", 302));

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
