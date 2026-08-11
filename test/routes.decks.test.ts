import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { L } from "../src/limits";

const BASE = "https://j2slide.test";

async function call(path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`${BASE}${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function createDeck() {
  const res = await call("/decks", { method: "POST" });
  expect(res.status).toBe(201);
  return (await res.json()) as {
    deck_id: string;
    api_key: string;
    view_url: string;
    mcp_url: string;
    warning: string;
    idle_expiry_ms: number;
  };
}

const push = (deck: { deck_id: string; api_key: string }, body: unknown) =>
  call(`/decks/${deck.deck_id}/slides`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${deck.api_key}` },
    body: JSON.stringify(body),
  });

const bar = { type: "bar", title: "Revenue", data: [{ label: "Q1", value: 1 }] };

describe("POST /decks", () => {
  it("returns a key pair and both urls", async () => {
    const deck = await createDeck();
    expect(deck.deck_id).toMatch(/^[0-9a-f]{32}$/);
    expect(deck.api_key).toMatch(/^sk_[0-9a-f]{32}$/);
    expect(deck.view_url).toBe(`${BASE}/d/${deck.deck_id}`);
    expect(deck.mcp_url).toBe(`${BASE}/mcp/${deck.deck_id}`);
  });

  it("documents two-hour idle slide expiry for the client", async () => {
    const deck = await createDeck();
    expect(deck.idle_expiry_ms).toBe(L.EXPIRY_MS);
    expect(deck.idle_expiry_ms).toBe(2 * 60 * 60 * 1000);
    expect(deck.warning.toLowerCase()).toMatch(/2 hours|two hours/);
    expect(deck.warning.toLowerCase()).toMatch(/idle|inactiv/);
  });

  it("issues a distinct deck each time", async () => {
    const a = await createDeck();
    const b = await createDeck();
    expect(a.deck_id).not.toBe(b.deck_id);
    expect(a.api_key).not.toBe(b.api_key);
  });
});

describe("POST /decks/{id}/slides", () => {
  it("accepts a valid slide", async () => {
    const deck = await createDeck();
    const res = await push(deck, bar);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ seq: 1, index: 0, total: 1 });
  });

  it("rejects a missing authorization header", async () => {
    const deck = await createDeck();
    const res = await call(`/decks/${deck.deck_id}/slides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bar),
    });
    expect(res.status).toBe(401);
    expect((await res.json() as any).error).toBe("unauthorized");
  });

  it("rejects a malformed authorization header", async () => {
    const deck = await createDeck();
    const res = await call(`/decks/${deck.deck_id}/slides`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: deck.api_key },
      body: JSON.stringify(bar),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a key belonging to another deck", async () => {
    const a = await createDeck();
    const b = await createDeck();
    const res = await push({ deck_id: a.deck_id, api_key: b.api_key }, bar);
    expect(res.status).toBe(403);
    expect((await res.json() as any).error).toBe("forbidden");
  });

  it("returns 404 for a deck that was never created", async () => {
    const res = await push({ deck_id: "f".repeat(32), api_key: "sk_" + "0".repeat(32) }, bar);
    expect(res.status).toBe(404);
    expect((await res.json() as any).error).toBe("deck_not_found");
  });

  it("returns a field-level 400 for a schema violation", async () => {
    const deck = await createDeck();
    const res = await push(deck, { type: "bar", title: "x".repeat(L.TITLE_MAX + 1), data: [{ label: "a", value: 1 }] });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe("validation_failed");
    expect(body.details.some((d: any) => d.path === "title")).toBe(true);
    expect(typeof body.details[0].message).toBe("string");
  });

  it("rejects a body over the size cap before parsing it", async () => {
    const deck = await createDeck();
    const res = await call(`/decks/${deck.deck_id}/slides`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deck.api_key}`,
        "Content-Length": String(L.BODY_BYTES_MAX + 1),
      },
      body: JSON.stringify({ type: "text", title: "big", bullets: ["x".repeat(L.BULLET_MAX)] }),
    });
    expect(res.status).toBe(413);
    expect((await res.json() as any).error).toBe("payload_too_large");
  });

  it("returns 429 with Retry-After once the deck budget is spent", async () => {
    const deck = await createDeck();
    for (let i = 0; i < L.RATE_LIMIT_PER_MIN; i++) {
      expect((await push(deck, { ...bar, title: `S${i}` })).status).toBe(201);
    }
    const res = await push(deck, bar);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });
});

describe("GET and DELETE /decks/{id}/slides", () => {
  it("lists the slides currently in the deck", async () => {
    const deck = await createDeck();
    await push(deck, { ...bar, title: "A" });
    await push(deck, { ...bar, title: "B" });

    const res = await call(`/decks/${deck.deck_id}/slides`, {
      headers: { Authorization: `Bearer ${deck.api_key}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.slides.map((s: any) => s.title)).toEqual(["A", "B"]);
    expect(body.total).toBe(2);
  });

  it("clears the deck", async () => {
    const deck = await createDeck();
    await push(deck, bar);

    const res = await call(`/decks/${deck.deck_id}/slides`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${deck.api_key}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: 1 });
  });

  it("guards list and clear with the same auth rules", async () => {
    const deck = await createDeck();
    expect((await call(`/decks/${deck.deck_id}/slides`)).status).toBe(401);
    expect((await call(`/decks/${deck.deck_id}/slides`, { method: "DELETE" })).status).toBe(401);
  });
});
