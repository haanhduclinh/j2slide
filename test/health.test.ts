import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../src/index";

describe("health", () => {
  it("reports service name and version", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("https://x.dev/health"), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ service: "j2slide", status: "ok" });
  });
});
