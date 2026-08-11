import { describe, it, expect } from "vitest";
import { L } from "../src/limits";

describe("idle expiry limit", () => {
  it("is two hours of inactivity", () => {
    expect(L.EXPIRY_MS).toBe(2 * 60 * 60 * 1000);
  });
});
