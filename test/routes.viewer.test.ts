import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";

const BASE = "https://j2slide.test";

async function call(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`${BASE}${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function createDeck() {
  return (await (await call("/decks", { method: "POST" })).json()) as {
    deck_id: string; api_key: string;
  };
}

describe("viewer page", () => {
  it("serves html for an existing deck", async () => {
    const deck = await createDeck();
    const res = await call(`/d/${deck.deck_id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("embeds the deck id for the client script", async () => {
    const deck = await createDeck();
    const html = await (await call(`/d/${deck.deck_id}`)).text();
    expect(html).toContain(deck.deck_id);
  });

  it("references the viewer assets and no external origin", async () => {
    const deck = await createDeck();
    const html = await (await call(`/d/${deck.deck_id}`)).text();
    expect(html).toContain("/viewer.css");
    expect(html).toContain("/viewer.js");
    expect(html).not.toMatch(/https?:\/\/(?!j2slide\.test)/);
  });

  it("never leaks an api key to the viewer", async () => {
    const deck = await createDeck();
    const html = await (await call(`/d/${deck.deck_id}`)).text();
    expect(html).not.toContain(deck.api_key);
    expect(html).not.toContain("sk_");
  });

  it("returns 404 for a malformed deck id", async () => {
    expect((await call("/d/not-a-deck")).status).toBe(404);
  });

  it("returns 404 for a deck that was never created", async () => {
    expect((await call(`/d/${"a".repeat(32)}`)).status).toBe(404);
  });

  it("upgrades the websocket route", async () => {
    const deck = await createDeck();
    const res = await call(`/d/${deck.deck_id}/ws`, { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(101);
    expect(res.webSocket).toBeTruthy();
  });

  it("refuses the websocket route without an upgrade header", async () => {
    const deck = await createDeck();
    expect((await call(`/d/${deck.deck_id}/ws`)).status).toBe(426);
  });

  it("delivers init over the viewer websocket", async () => {
    const deck = await createDeck();
    await call(`/decks/${deck.deck_id}/slides`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deck.api_key}` },
      body: JSON.stringify({ type: "bar", title: "Live", data: [{ label: "Q1", value: 1 }] }),
    });

    const res = await call(`/d/${deck.deck_id}/ws`, { headers: { Upgrade: "websocket" } });
    const ws = res.webSocket!;
    ws.accept();

    const message = await new Promise<any>((resolve) => {
      ws.addEventListener("message", (event) => resolve(JSON.parse(event.data as string)));
    });

    expect(message.type).toBe("init");
    expect(message.slides[0].title).toBe("Live");
  });
});
