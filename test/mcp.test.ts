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
  return (await res.json()) as { deck_id: string; api_key: string };
}

async function rpc(deck: { deck_id: string; api_key: string }, method: string, params?: unknown, id: number | null = 1) {
  const res = await call(`/mcp/${deck.deck_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${deck.api_key}` },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { status: res.status, body: res.status === 202 ? null : await res.json() as any };
}

describe("mcp endpoint", () => {
  it("rejects an unauthenticated call", async () => {
    const deck = await createDeck();
    const res = await call(`/mcp/${deck.deck_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(401);
  });

  it("responds to initialize with server info and tool capability", async () => {
    const deck = await createDeck();
    const { body } = await rpc(deck, "initialize", { protocolVersion: "2025-06-18" });
    expect(body.result.serverInfo.name).toBe("j2slide");
    expect(body.result.capabilities).toHaveProperty("tools");
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("echoes back an unfamiliar protocol version rather than failing", async () => {
    const deck = await createDeck();
    const { body } = await rpc(deck, "initialize", { protocolVersion: "2099-01-01" });
    expect(body.result.protocolVersion).toBe("2099-01-01");
  });

  it("accepts the initialized notification with no body", async () => {
    const deck = await createDeck();
    const { status } = await rpc(deck, "notifications/initialized", undefined, null);
    expect(status).toBe(202);
  });

  it("lists all present tools plus clear_deck", async () => {
    const deck = await createDeck();
    const { body } = await rpc(deck, "tools/list");
    expect(body.result.tools.map((t: any) => t.name).sort()).toEqual([
      "clear_deck",
      "present_area",
      "present_bar",
      "present_donut",
      "present_kpi",
      "present_line",
      "present_pie",
      "present_scatter",
      "present_stacked_bar",
      "present_table",
      "present_text",
    ]);
  });

  it("publishes the documented limits in every tool schema", async () => {
    const deck = await createDeck();
    const { body } = await rpc(deck, "tools/list");
    const byName = Object.fromEntries(body.result.tools.map((t: any) => [t.name, t.inputSchema]));

    expect(byName.present_bar.properties.title.maxLength).toBe(L.TITLE_MAX);
    expect(byName.present_bar.properties.data.maxItems).toBe(L.SERIES_MAX);
    expect(byName.present_pie.properties.data.maxItems).toBe(L.PIE_MAX);
    expect(byName.present_text.properties.bullets.maxItems).toBe(L.BULLETS_MAX);
    expect(byName.present_kpi.properties.items.maxItems).toBe(L.KPI_MAX);
    expect(byName.present_bar.required).toContain("title");
    expect(byName.present_table.properties.columns.maxItems).toBe(L.TABLE_COLS_MAX);
    expect(byName.present_table.properties.rows.maxItems).toBe(L.TABLE_ROWS_MAX);
    expect(byName.present_area.properties.categories.maxItems).toBe(L.CATEGORIES_MAX);
    expect(byName.present_area.properties.series.maxItems).toBe(L.MULTI_SERIES_MAX);
    expect(byName.present_scatter.properties.points.maxItems).toBe(L.SCATTER_MAX);
    expect(byName.present_donut.properties.data.maxItems).toBe(L.PIE_MAX);
  });

  it("presents a bar slide and reports its position", async () => {
    const deck = await createDeck();
    const { body } = await rpc(deck, "tools/call", {
      name: "present_bar",
      arguments: { title: "Revenue", data: [{ label: "Q1", value: 1 }] },
    });
    expect(body.result.isError).toBeFalsy();
    expect(body.result.content[0].text).toContain("slide 1 of 1");

    const listed = await call(`/decks/${deck.deck_id}/slides`, {
      headers: { Authorization: `Bearer ${deck.api_key}` },
    });
    expect(((await listed.json()) as any).slides[0].title).toBe("Revenue");
  });

  it("returns a tool error, not a protocol error, for bad arguments", async () => {
    const deck = await createDeck();
    const { body } = await rpc(deck, "tools/call", {
      name: "present_bar",
      arguments: { title: "x".repeat(L.TITLE_MAX + 1), data: [{ label: "a", value: 1 }] },
    });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("title");
    expect(body.error).toBeUndefined();
  });

  it("clears the deck through the tool", async () => {
    const deck = await createDeck();
    await rpc(deck, "tools/call", { name: "present_bar", arguments: { title: "A", data: [{ label: "Q1", value: 1 }] } });
    const { body } = await rpc(deck, "tools/call", { name: "clear_deck", arguments: {} });
    expect(body.result.content[0].text).toContain("1");
  });

  it("presents a table slide through MCP", async () => {
    const deck = await createDeck();
    const { body } = await rpc(deck, "tools/call", {
      name: "present_table",
      arguments: {
        title: "Unit economics",
        columns: ["Metric", "Value"],
        rows: [["ARPU", "$12"]],
      },
    });
    expect(body.result.isError).toBeFalsy();
    expect(body.result.content[0].text).toContain("slide 1 of 1");

    const listed = await call(`/decks/${deck.deck_id}/slides`, {
      headers: { Authorization: `Bearer ${deck.api_key}` },
    });
    const slides = ((await listed.json()) as any).slides;
    expect(slides[0].type).toBe("table");
    expect(slides[0].columns).toEqual(["Metric", "Value"]);
  });

  it("reports an unknown tool as a tool error", async () => {
    const deck = await createDeck();
    const { body } = await rpc(deck, "tools/call", { name: "present_heatmap", arguments: {} });
    expect(body.result.isError).toBe(true);
  });

  it("returns method not found for an unknown method", async () => {
    const deck = await createDeck();
    const { body } = await rpc(deck, "resources/list");
    expect(body.error.code).toBe(-32601);
  });

  it("rejects a body over the size cap before parsing it", async () => {
    const deck = await createDeck();
    const res = await call(`/mcp/${deck.deck_id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deck.api_key}`,
        "Content-Length": String(L.BODY_BYTES_MAX + 1),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "present_text",
          arguments: { title: "big", bullets: ["x".repeat(L.BULLET_MAX)] },
        },
      }),
    });
    expect(res.status).toBe(413);
    expect((await res.json() as any).error).toBe("payload_too_large");
  });
});
