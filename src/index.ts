import { Hono } from "hono";

export interface Env {
  DECK: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ service: "j2slide", status: "ok" }));

export default app;
