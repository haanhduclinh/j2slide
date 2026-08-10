import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { hashKey } from "../src/auth";
import type { SlideInput } from "../src/schemas";

const KEY = "sk_00000000000000000000000000000000";

let counter = 0;
async function newDeck() {
  const stub = env.DECK.get(env.DECK.idFromName(`ws-${counter++}-${Math.random()}`));
  await stub.init(await hashKey(KEY));
  return stub;
}

const bar = (title: string): SlideInput => ({
  type: "bar", title, data: [{ label: "Q1", value: 1 }],
});

/** Opens a socket to the deck and collects messages as they arrive. */
async function connect(stub: DurableObjectStub) {
  const res = await stub.fetch("https://do/ws", { headers: { Upgrade: "websocket" } });
  const ws = res.webSocket;
  if (!ws) throw new Error(`no websocket in response (status ${res.status})`);

  const received: any[] = [];
  const waiters: Array<() => void> = [];
  ws.accept();
  ws.addEventListener("message", (event) => {
    received.push(JSON.parse(event.data as string));
    waiters.splice(0).forEach((resolve) => resolve());
  });

  async function next(count: number) {
    while (received.length < count) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    return received;
  }

  return { ws, received, next };
}

describe("DeckDO websocket", () => {
  it("refuses a non-upgrade request", async () => {
    const stub = await newDeck();
    const res = await stub.fetch("https://do/ws");
    expect(res.status).toBe(426);
  });

  it("refuses a socket for a deck that was never created", async () => {
    const stub = env.DECK.get(env.DECK.idFromName(`missing-${Math.random()}`));
    const res = await stub.fetch("https://do/ws", { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(404);
  });

  it("sends init with the current deck on connect", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));
    await stub.pushSlide(KEY, bar("B"));

    const client = await connect(stub);
    const [init] = await client.next(1);

    expect(init.type).toBe("init");
    expect(init.slides.map((s: any) => s.title)).toEqual(["A", "B"]);
    expect(init.liveIndex).toBe(1);
  });

  it("sends init with liveIndex -1 for an empty deck", async () => {
    const stub = await newDeck();
    const client = await connect(stub);
    const [init] = await client.next(1);

    expect(init.slides).toEqual([]);
    expect(init.liveIndex).toBe(-1);
  });

  it("broadcasts a pushed slide to every connected viewer", async () => {
    const stub = await newDeck();
    const a = await connect(stub);
    const b = await connect(stub);
    await a.next(1);
    await b.next(1);

    await stub.pushSlide(KEY, bar("Live"));

    const [, aSlide] = await a.next(2);
    const [, bSlide] = await b.next(2);

    expect(aSlide).toEqual({ type: "slide", slide: expect.objectContaining({ title: "Live" }), index: 0 });
    expect(bSlide.slide.title).toBe("Live");
  });

  it("gives a late joiner the full deck rather than replaying pushes", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));

    const late = await connect(stub);
    const [init] = await late.next(1);
    expect(init.slides.map((s: any) => s.title)).toEqual(["A"]);
  });

  it("broadcasts a clear", async () => {
    const stub = await newDeck();
    await stub.pushSlide(KEY, bar("A"));

    const client = await connect(stub);
    await client.next(1);
    await stub.clearSlides(KEY);

    const [, cleared] = await client.next(2);
    expect(cleared).toEqual({ type: "clear" });
  });

  it("does not broadcast a rate-limited push", async () => {
    const stub = await newDeck();
    const client = await connect(stub);
    await client.next(1);

    for (let i = 0; i < 60; i++) await stub.pushSlide(KEY, bar(`S${i}`));
    const before = client.received.length;
    await stub.pushSlide(KEY, bar("over"));

    expect(client.received.length).toBe(before);
  });
});
