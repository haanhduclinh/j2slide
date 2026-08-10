import { OpenAPIHono, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { BarSlide, KpiSlide, LineSlide, PieSlide, SlideInput, TextSlide } from "../schemas";
import type { Env } from "../index";

const DeckCreated = z.object({
  deck_id: z.string(),
  api_key: z.string(),
  view_url: z.string(),
  mcp_url: z.string(),
  warning: z.string(),
}).openapi("DeckCreated");

const PushResult = z.object({
  seq: z.number().int(),
  index: z.number().int(),
  total: z.number().int(),
}).openapi("PushResult");

const SlideList = z.object({
  slides: z.array(z.any()),
  total: z.number().int(),
}).openapi("SlideList");

const ClearResult = z.object({ cleared: z.number().int() }).openapi("ClearResult");

const ErrorBody = z.object({
  error: z.string(),
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
}).openapi("Error");

const DeckIdParam = z.object({
  deckId: z.string().length(32).openapi({ param: { name: "deckId", in: "path" } }),
});

const json = <T>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

/**
 * The document is described here rather than by wrapping the handlers, so the
 * handlers stay plain Hono. `test/openapi.test.ts` asserts the published limits
 * match `src/limits.ts`, which is what stops the two drifting apart.
 */
export const openapiRoutes = new OpenAPIHono<{ Bindings: Env }>();

openapiRoutes.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "The deck's api_key, returned once by POST /decks.",
});

// Register the union members so every slide type appears in components.schemas.
for (const [name, schema] of [
  ["BarSlide", BarSlide], ["LineSlide", LineSlide], ["PieSlide", PieSlide],
  ["TextSlide", TextSlide], ["KpiSlide", KpiSlide],
] as const) {
  openapiRoutes.openAPIRegistry.register(name, schema);
}

openapiRoutes.openAPIRegistry.registerPath({
  method: "post",
  path: "/decks",
  summary: "Create a deck and receive its key pair",
  description: "The api_key is returned exactly once and is never retrievable again.",
  responses: { 201: json(DeckCreated, "Deck created") },
});

openapiRoutes.openAPIRegistry.registerPath({
  method: "post",
  path: "/decks/{deckId}/slides",
  summary: "Push a slide and show it to every viewer immediately",
  security: [{ bearerAuth: [] }],
  request: {
    params: DeckIdParam,
    body: { content: { "application/json": { schema: SlideInput } } },
  },
  responses: {
    201: json(PushResult, "Slide accepted and broadcast"),
    400: json(ErrorBody, "Validation failed; details name the offending fields"),
    401: json(ErrorBody, "Missing or malformed Authorization header"),
    403: json(ErrorBody, "Key does not match this deck"),
    404: json(ErrorBody, "Deck not found"),
    413: json(ErrorBody, "Body over 32 KB"),
    429: json(ErrorBody, "Rate limit exceeded; see Retry-After"),
  },
});

openapiRoutes.openAPIRegistry.registerPath({
  method: "get",
  path: "/decks/{deckId}/slides",
  summary: "List the slides currently in the deck",
  security: [{ bearerAuth: [] }],
  request: { params: DeckIdParam },
  responses: { 200: json(SlideList, "Current slides") },
});

openapiRoutes.openAPIRegistry.registerPath({
  method: "delete",
  path: "/decks/{deckId}/slides",
  summary: "Clear the deck to start a new session",
  security: [{ bearerAuth: [] }],
  request: { params: DeckIdParam },
  responses: { 200: json(ClearResult, "Deck cleared") },
});

openapiRoutes.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "j2slide",
    version: "1.0.0",
    description:
      "Push chart JSON; it appears immediately on every open viewer. " +
      "Create a deck with POST /decks, share view_url, then push slides.",
  },
});

openapiRoutes.get("/docs", swaggerUI({ url: "/openapi.json" }));
