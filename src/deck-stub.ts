import type { DeckDO } from "./deck-do";
import type { Env } from "./index";

/**
 * Resolves a deck id to its Durable Object stub. The deck id *is* the object
 * name, which is why the service needs no lookup table.
 */
export function deckStub(env: Env, deckId: string): DurableObjectStub<DeckDO> {
  return env.DECK.get(env.DECK.idFromName(deckId)) as DurableObjectStub<DeckDO>;
}
