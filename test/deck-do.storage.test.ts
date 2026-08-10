import { env, runInDurableObject } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { hashKey } from "../src/auth";
import { L } from "../src/limits";
import type { SlideInput } from "../src/schemas";

const KEY = "sk_00000000000000000000000000000000";
const OTHER_KEY = "sk_11111111111111111111111111111111";

let counter = 0;
async function newDeck() {
  const name = `deck-${counter++}-${Math.random()}`;
  const stub = env.DECK.get(env.DECK.idFromName(name));
  await stub.init(await hashKey(KEY));
  return stub;
}

const bar = (title: string): SlideInput => ({
  type: "bar",
  title,
  data: [{ label: "Q1", value: 1 }],
});

describe("DeckDO storage", () => {
  it("rejects any call before init", async () => {
    const stub = env.DECK.get(env.DECK.idFromName(`fresh-${Math.random()}`));
    const result = await stub.pushSlide(KEY, bar("A"));
    expect(result).toEqual({ ok: false, error: "deck_not_found" });
  });

  it("reports whether the deck has been created", async () => {
    const fresh = env.DECK.get(env.DECK.idFromName(`probe-${Math.random()}`));
    expect(await fresh.exists()).toBe(false);
    expect(await (await newDeck()).exists()).toBe(true);
  });

  it("rejects a key that does not match the deck", async () => {
    const stub = await newDeck();
    expect(await stub.pushSlide(OTHER_KEY, bar("A"))).toEqual({ ok: false, error: "forbidden" });
  });

  it("stores a pushed slide and returns its position", async () => {
    const stub = await newDeck();
    const result = await stub.pushSlide(KEY, bar("A"));
    expect(result).toEqual({ ok: true, value: { seq: 1, index: 0, total: 1 } });
  });

  it("assigns increasing seq values and preserves push order", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));
    await stub.pushSlide(KEY, bar("B"));
    await stub.pushSlide(KEY, bar("C"));

    const listed = await stub.listSlides(KEY);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.slides.map((s) => s.title)).toEqual(["A", "B", "C"]);
    expect(listed.value.slides.map((s) => s.seq)).toEqual([1, 2, 3]);
    expect(listed.value.total).toBe(3);
  });

  it("stamps each slide with a creation time", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));
    const listed = await stub.listSlides(KEY);
    if (!listed.ok) throw new Error("expected ok");
    expect(listed.value.slides[0].createdAt).toBeGreaterThan(0);
  });

  it("survives eviction from memory", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));

    // Force the instance to be reconstructed, then read again.
    await runInDurableObject(stub, async (_instance, state) => {
      await state.blockConcurrencyWhile(async () => {});
    });

    const listed = await stub.listSlides(KEY);
    if (!listed.ok) throw new Error("expected ok");
    expect(listed.value.slides.map((s) => s.title)).toEqual(["A"]);
  });

  it("evicts the oldest slide past the cap while seq keeps climbing", async () => {
    const stub = await newDeck();
    for (let i = 0; i < L.SLIDE_CAP + 3; i++) {
      await runInDurableObject(stub, async (_x, state) => {
        const meta = await state.storage.get<Record<string, unknown>>("meta");
        await state.storage.put("meta", { ...meta, rateTokens: L.RATE_LIMIT_PER_MIN });
      });
      const result = await stub.pushSlide(KEY, bar(`S${i}`));
      expect(result.ok).toBe(true);
    }

    const listed = await stub.listSlides(KEY);
    if (!listed.ok) throw new Error("expected ok");
    expect(listed.value.slides).toHaveLength(L.SLIDE_CAP);
    expect(listed.value.slides[0].title).toBe("S3");
    expect(listed.value.slides[0].seq).toBe(4);
    expect(listed.value.slides.at(-1)!.seq).toBe(L.SLIDE_CAP + 3);
  });

  it("clears every slide and reports how many were removed", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));
    await stub.pushSlide(KEY, bar("B"));

    expect(await stub.clearSlides(KEY)).toEqual({ ok: true, value: { cleared: 2 } });

    const listed = await stub.listSlides(KEY);
    if (!listed.ok) throw new Error("expected ok");
    expect(listed.value.slides).toEqual([]);
  });

  it("keeps seq monotonic across a clear", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));
    await stub.clearSlides(KEY);
    const result = await stub.pushSlide(KEY, bar("B"));
    expect(result).toEqual({ ok: true, value: { seq: 2, index: 0, total: 1 } });
  });

  it("keeps the deck usable after a clear", async () => {
    const stub = await newDeck();
    await stub.clearSlides(KEY);
    expect((await stub.pushSlide(KEY, bar("A"))).ok).toBe(true);
  });

  it("guards list and clear with the same key check", async () => {
    const stub = await newDeck();
    expect(await stub.listSlides(OTHER_KEY)).toEqual({ ok: false, error: "forbidden" });
    expect(await stub.clearSlides(OTHER_KEY)).toEqual({ ok: false, error: "forbidden" });
  });
});
