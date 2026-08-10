import { describe, it, expect } from "vitest";
import { generateDeckId, generateApiKey, hashKey, timingSafeEqual, extractBearer } from "../src/auth";

describe("auth", () => {
  it("generates a 32-character lowercase hex deck id", () => {
    expect(generateDeckId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates distinct deck ids", () => {
    const ids = new Set(Array.from({ length: 200 }, generateDeckId));
    expect(ids.size).toBe(200);
  });

  it("generates an api key with the sk_ prefix", () => {
    expect(generateApiKey()).toMatch(/^sk_[0-9a-f]{32}$/);
  });

  it("hashes to a stable 64-character hex digest", async () => {
    const digest = await hashKey("sk_abc");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashKey("sk_abc")).toBe(digest);
  });

  it("produces different digests for different keys", async () => {
    expect(await hashKey("sk_a")).not.toBe(await hashKey("sk_b"));
  });

  it("compares equal strings as equal", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });

  it("compares different strings as unequal", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "a")).toBe(false);
  });

  it("extracts a bearer token", () => {
    expect(extractBearer("Bearer sk_123")).toBe("sk_123");
  });

  it("returns null for missing or malformed headers", () => {
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer("")).toBeNull();
    expect(extractBearer("sk_123")).toBeNull();
    expect(extractBearer("Basic sk_123")).toBeNull();
    expect(extractBearer("Bearer")).toBeNull();
    expect(extractBearer("Bearer ")).toBeNull();
  });
});
