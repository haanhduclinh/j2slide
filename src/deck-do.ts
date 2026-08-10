import { DurableObject } from "cloudflare:workers";
import { timingSafeEqual, hashKey } from "./auth";
import { L } from "./limits";
import type { Slide, SlideInput } from "./schemas";

export type DeckErrorCode = "deck_not_found" | "forbidden" | "rate_limited";

export type DeckResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DeckErrorCode; retryAfter?: number };

export type ServerMessage =
  | { type: "init"; slides: Slide[]; liveIndex: number }
  | { type: "slide"; slide: Slide; index: number }
  | { type: "clear" };

interface DeckMeta {
  apiKeyHash: string;
  createdAt: number;
  lastActiveAt: number;
  /** Next seq to hand out. Monotonic for the deck's whole life. */
  nextSeq: number;
  /** Seq of the oldest slide still stored. */
  firstSeq: number;
  count: number;
  /** Token bucket: whole tokens available, refilled continuously. */
  rateTokens: number;
  rateRefilledAt: number;
}

const META = "meta";
const slideKey = (seq: number) => `slide:${String(seq).padStart(6, "0")}`;

export class DeckDO extends DurableObject<unknown> {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    // Keepalive handled by the runtime, so an idle deck stays hibernated.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }
    const meta = await this.ctx.storage.get<DeckMeta>(META);
    if (!meta) return new Response("deck_not_found", { status: 404 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // acceptWebSocket (not server.accept) is what makes the deck hibernatable.
    this.ctx.acceptWebSocket(server);

    const slides = await this.readSlides();
    server.send(JSON.stringify({
      type: "init",
      slides,
      liveIndex: slides.length - 1,
    } satisfies ServerMessage));

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Viewers never send application messages; ignore anything that arrives. */
  async webSocketMessage(): Promise<void> {}

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // A socket that cannot receive is already gone; the runtime cleans it up.
      }
    }
  }

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
      rateTokens: L.RATE_LIMIT_PER_MIN,
      rateRefilledAt: now,
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

    const now = Date.now();
    this.refill(meta, now);
    if (meta.rateTokens < 1) {
      const retryAfter = this.retryAfter(meta);
      // Persist the refill so the bucket does not reset on the next call.
      await this.ctx.storage.put(META, meta);
      return { ok: false, error: "rate_limited", retryAfter };
    }
    meta.rateTokens -= 1;

    const seq = meta.nextSeq;
    const slide: Slide = { ...input, seq, createdAt: now };

    await this.ctx.storage.put(slideKey(seq), slide);
    meta.nextSeq = seq + 1;
    meta.count += 1;

    while (meta.count > L.SLIDE_CAP) {
      await this.ctx.storage.delete(slideKey(meta.firstSeq));
      meta.firstSeq += 1;
      meta.count -= 1;
    }

    meta.lastActiveAt = now;
    await this.ctx.storage.put(META, meta);
    await this.ctx.storage.setAlarm(now + L.EXPIRY_MS);

    this.broadcast({ type: "slide", slide, index: meta.count - 1 });

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

    this.broadcast({ type: "clear" });

    return { ok: true, value: { cleared } };
  }

  /** Continuous refill: a full window restores the full budget. */
  private refill(meta: DeckMeta, now: number): void {
    const elapsed = now - meta.rateRefilledAt;
    if (elapsed <= 0) return;
    const gained = (elapsed / L.RATE_WINDOW_MS) * L.RATE_LIMIT_PER_MIN;
    meta.rateTokens = Math.min(L.RATE_LIMIT_PER_MIN, meta.rateTokens + gained);
    meta.rateRefilledAt = now;
  }

  /** Seconds until one token is available again, at least 1. */
  private retryAfter(meta: DeckMeta): number {
    const missing = 1 - meta.rateTokens;
    const ms = (missing / L.RATE_LIMIT_PER_MIN) * L.RATE_WINDOW_MS;
    return Math.max(1, Math.ceil(ms / 1000));
  }

  async alarm(): Promise<void> {
    const meta = await this.ctx.storage.get<DeckMeta>(META);
    if (!meta) return;

    const idleFor = Date.now() - meta.lastActiveAt;
    if (idleFor < L.EXPIRY_MS) {
      // Activity happened after this alarm was set; push it out again.
      await this.ctx.storage.setAlarm(meta.lastActiveAt + L.EXPIRY_MS);
      return;
    }

    await this.deleteAllSlides(meta);
    await this.ctx.storage.put(META, meta);
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
