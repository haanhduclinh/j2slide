import { Hono } from "hono";
import { deckRoutes } from "./routes/decks";
import type { DeckDO } from "./deck-do";

export interface Env {
  DECK: DurableObjectNamespace<DeckDO>;
  ASSETS: Fetcher;
}

export { DeckDO } from "./deck-do";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ service: "j2slide", status: "ok" }));
app.route("/", deckRoutes);

export default app;
