import { env, runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { hashKey } from "../src/auth";
import { L } from "../src/limits";
import type { SlideInput } from "../src/schemas";

const KEY = "sk_00000000000000000000000000000000";

let counter = 0;
async function newDeck() {
  const stub = env.DECK.get(env.DECK.idFromName(`limits-${counter++}-${Math.random()}`));
  await stub.init(await hashKey(KEY));
  return stub;
}

const bar = (title: string): SlideInput => ({
  type: "bar", title, data: [{ label: "Q1", value: 1 }],
});

describe("DeckDO rate limiting", () => {
  it("allows exactly the configured burst", async () => {
    const stub = await newDeck();
    for (let i = 0; i < L.RATE_LIMIT_PER_MIN; i++) {
      expect((await stub.pushSlide(KEY, bar(`S${i}`))).ok).toBe(true);
    }
  });

  it("rejects the next push with a retry hint", async () => {
    const stub = await newDeck();
    for (let i = 0; i < L.RATE_LIMIT_PER_MIN; i++) await stub.pushSlide(KEY, bar(`S${i}`));

    const result = await stub.pushSlide(KEY, bar("over"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("rate_limited");
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("does not store a rate-limited slide", async () => {
    const stub = await newDeck();
    for (let i = 0; i < L.RATE_LIMIT_PER_MIN; i++) await stub.pushSlide(KEY, bar(`S${i}`));
    await stub.pushSlide(KEY, bar("over"));

    const listed = await stub.listSlides(KEY);
    if (!listed.ok) throw new Error("expected ok");
    expect(listed.value.slides.some((s) => s.title === "over")).toBe(false);
  });

  it("refills the bucket as time passes", async () => {
    const stub = await newDeck();
    for (let i = 0; i < L.RATE_LIMIT_PER_MIN; i++) await stub.pushSlide(KEY, bar(`S${i}`));
    expect((await stub.pushSlide(KEY, bar("over"))).ok).toBe(false);

    // Rewind the refill marker by a full window: equivalent to waiting a minute.
    await runInDurableObject(stub, async (_i, state) => {
      const meta = await state.storage.get<{ rateRefilledAt: number }>("meta");
      await state.storage.put("meta", { ...meta, rateRefilledAt: Date.now() - L.RATE_WINDOW_MS });
    });

    expect((await stub.pushSlide(KEY, bar("after wait"))).ok).toBe(true);
  });

  it("checks the key before the rate limit", async () => {
    const stub = await newDeck();
    for (let i = 0; i < L.RATE_LIMIT_PER_MIN; i++) await stub.pushSlide(KEY, bar(`S${i}`));

    const result = await stub.pushSlide("sk_wrongwrongwrongwrongwrongwrongwr", bar("x"));
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("DeckDO expiry alarm", () => {
  it("clears slides once the deck has been idle past the expiry window", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));

    await runInDurableObject(stub, async (_i, state) => {
      const meta = await state.storage.get<{ lastActiveAt: number }>("meta");
      await state.storage.put("meta", { ...meta, lastActiveAt: Date.now() - L.EXPIRY_MS - 1000 });
    });

    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const listed = await stub.listSlides(KEY);
    if (!listed.ok) throw new Error("expected ok");
    expect(listed.value.slides).toEqual([]);
  });

  it("keeps the deck and its key alive after expiry", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));

    await runInDurableObject(stub, async (_i, state) => {
      const meta = await state.storage.get<{ lastActiveAt: number }>("meta");
      await state.storage.put("meta", { ...meta, lastActiveAt: Date.now() - L.EXPIRY_MS - 1000 });
    });
    await runDurableObjectAlarm(stub);

    // The same key still works and seq has not been reused.
    const result = await stub.pushSlide(KEY, bar("B"));
    expect(result).toEqual({ ok: true, value: { seq: 2, index: 0, total: 1 } });
  });

  it("reschedules instead of clearing when the deck is still active", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));

    await runDurableObjectAlarm(stub);

    const listed = await stub.listSlides(KEY);
    if (!listed.ok) throw new Error("expected ok");
    expect(listed.value.slides).toHaveLength(1);
  });
});
