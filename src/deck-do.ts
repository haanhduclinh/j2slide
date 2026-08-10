import { DurableObject } from "cloudflare:workers";
import { timingSafeEqual, hashKey } from "./auth";
import { L } from "./limits";
import type { Slide, SlideInput } from "./schemas";

export type DeckErrorCode = "deck_not_found" | "forbidden" | "rate_limited";

export type DeckResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DeckErrorCode; retryAfter?: number };

interface DeckMeta {
  apiKeyHash: string;
  createdAt: number;
  lastActiveAt: number;
  /** Next seq to hand out. Monotonic for the deck's whole life. */
  nextSeq: number;
  /** Seq of the oldest slide still stored. */
  firstSeq: number;
  count: number;
}

const META = "meta";
const slideKey = (seq: number) => `slide:${String(seq).padStart(6, "0")}`;

export class DeckDO extends DurableObject<unknown> {
  /** Creates the deck. Idempotent: re-initialising an existing deck is a no-op. */
  async init(apiKeyHash: string): Promise<void> {
    const existing = await this.ctx.storage.get<DeckMeta>(META);
    if (existing) return;

    const now = Date.now();
    const meta: DeckMeta = {
      apiKeyHash,
      createdAt: now,
      lastActiveAt: now,
      nextSeq: 1,
      firstSeq: 1,
      count: 0,
    };
    await this.ctx.storage.put(META, meta);
  }

  /** Public: lets the viewer route 404 an unknown deck without holding a key. */
  async exists(): Promise<boolean> {
    return (await this.ctx.storage.get<DeckMeta>(META)) !== undefined;
  }

  async pushSlide(
    apiKey: string,
    input: SlideInput,
  ): Promise<DeckResult<{ seq: number; index: number; total: number }>> {
    const auth = await this.authorize(apiKey);
    if (!auth.ok) return auth;
    const meta = auth.value;

    const seq = meta.nextSeq;
    const slide: Slide = { ...input, seq, createdAt: Date.now() };

    await this.ctx.storage.put(slideKey(seq), slide);
    meta.nextSeq = seq + 1;
    meta.count += 1;

    while (meta.count > L.SLIDE_CAP) {
      await this.ctx.storage.delete(slideKey(meta.firstSeq));
      meta.firstSeq += 1;
      meta.count -= 1;
    }

    meta.lastActiveAt = Date.now();
    await this.ctx.storage.put(META, meta);

    return { ok: true, value: { seq, index: meta.count - 1, total: meta.count } };
  }

  async listSlides(apiKey: string): Promise<DeckResult<{ slides: Slide[]; total: number }>> {
    const auth = await this.authorize(apiKey);
    if (!auth.ok) return auth;

    const slides = await this.readSlides();
    return { ok: true, value: { slides, total: slides.length } };
  }

  async clearSlides(apiKey: string): Promise<DeckResult<{ cleared: number }>> {
    const auth = await this.authorize(apiKey);
    if (!auth.ok) return auth;
    const meta = auth.value;

    const cleared = await this.deleteAllSlides(meta);
    meta.lastActiveAt = Date.now();
    await this.ctx.storage.put(META, meta);

    return { ok: true, value: { cleared } };
  }

  protected async authorize(apiKey: string): Promise<DeckResult<DeckMeta>> {
    const meta = await this.ctx.storage.get<DeckMeta>(META);
    if (!meta) return { ok: false, error: "deck_not_found" };

    const presented = await hashKey(apiKey);
    if (!timingSafeEqual(presented, meta.apiKeyHash)) {
      return { ok: false, error: "forbidden" };
    }
    return { ok: true, value: meta };
  }

  protected async readSlides(): Promise<Slide[]> {
    const stored = await this.ctx.storage.list<Slide>({ prefix: "slide:" });
    // Zero-padded keys sort lexicographically in seq order.
    return [...stored.values()];
  }

  protected async deleteAllSlides(meta: DeckMeta): Promise<number> {
    const keys = [...(await this.ctx.storage.list<Slide>({ prefix: "slide:" })).keys()];
    if (keys.length > 0) await this.ctx.storage.delete(keys);

    const cleared = meta.count;
    meta.count = 0;
    meta.firstSeq = meta.nextSeq;
    return cleared;
  }
}
