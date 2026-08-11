import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";
import { L } from "../src/limits";

async function get(path: string) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`https://j2slide.test${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("openapi document", () => {
  it("is served as json", async () => {
    const res = await get("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("declares the expected version and title", async () => {
    const doc = await (await get("/openapi.json")).json() as any;
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe("j2slide");
  });

  it("documents every public path", async () => {
    const doc = await (await get("/openapi.json")).json() as any;
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/decks",
      "/decks/{deckId}/slides",
    ]);
    expect(doc.paths["/decks/{deckId}/slides"]).toHaveProperty("post");
    expect(doc.paths["/decks/{deckId}/slides"]).toHaveProperty("get");
    expect(doc.paths["/decks/{deckId}/slides"]).toHaveProperty("delete");
  });

  it("exposes every slide type in the request schema", async () => {
    const doc = await (await get("/openapi.json")).json() as any;
    const names = Object.keys(doc.components.schemas);
    for (const t of [
      "BarSlide", "LineSlide", "PieSlide", "TextSlide", "KpiSlide",
      "TableSlide", "AreaSlide", "StackedBarSlide", "ScatterSlide", "DonutSlide",
      "CompositeSlide",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("publishes the documented limits so an agent can read them", async () => {
    const doc = JSON.stringify(await (await get("/openapi.json")).json());
    const parsed = JSON.parse(doc);

    expect(parsed.components.schemas.BarSlide.properties.title.maxLength).toBe(L.TITLE_MAX);
    expect(parsed.components.schemas.BarSlide.properties.data.maxItems).toBe(L.SERIES_MAX);
    expect(parsed.components.schemas.PieSlide.properties.data.maxItems).toBe(L.PIE_MAX);
    expect(parsed.components.schemas.TextSlide.properties.bullets.maxItems).toBe(L.BULLETS_MAX);
    expect(parsed.components.schemas.KpiSlide.properties.items.maxItems).toBe(L.KPI_MAX);
  });

  it("documents idle slide expiry on create deck", async () => {
    const doc = await (await get("/openapi.json")).json() as any;
    const create = doc.paths["/decks"].post;
    expect(create.description).toMatch(/2 hours|two hours/i);
    expect(create.description).toMatch(/idle|inactiv/i);
    const schema = doc.components.schemas.DeckCreated;
    expect(schema.properties).toHaveProperty("idle_expiry_ms");
    expect(schema.required).toEqual(expect.arrayContaining(["idle_expiry_ms", "warning"]));
  });

  it("declares bearer auth on the write routes", async () => {
    const doc = await (await get("/openapi.json")).json() as any;
    expect(doc.components.securitySchemes).toHaveProperty("bearerAuth");
    expect(doc.paths["/decks/{deckId}/slides"].post.security).toEqual([{ bearerAuth: [] }]);
  });

  it("serves swagger ui", async () => {
    const res = await get("/docs");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("swagger");
    expect(html).toContain("/openapi.json");
  });
});
