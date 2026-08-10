import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";

async function get(path: string) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`https://j2slide.test${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("service entrypoint", () => {
  it("points the root at the docs", async () => {
    const res = await get("/");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/docs");
  });

  it("returns json for an unknown path", async () => {
    const res = await get("/nope");
    expect(res.status).toBe(404);
    expect((await res.json() as any).error).toBe("not_found");
  });

  it("keeps every documented route reachable", async () => {
    for (const path of ["/health", "/openapi.json", "/docs"]) {
      expect((await get(path)).status).toBe(200);
    }
  });
});
