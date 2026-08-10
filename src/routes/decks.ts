import { Hono } from "hono";
import { extractBearer, generateApiKey, generateDeckId, hashKey } from "../auth";
import { deckStub } from "../deck-stub";
import { errorResponse, type ErrorDetail } from "../errors";
import { L } from "../limits";
import { SlideInput } from "../schemas";
import type { Env } from "../index";

export const deckRoutes = new Hono<{ Bindings: Env }>();

deckRoutes.post("/decks", async (c) => {
  const deckId = generateDeckId();
  const apiKey = generateApiKey();

  await deckStub(c.env, deckId).init(await hashKey(apiKey));

  const origin = new URL(c.req.url).origin;
  return c.json({
    deck_id: deckId,
    api_key: apiKey,
    view_url: `${origin}/d/${deckId}`,
    mcp_url: `${origin}/mcp/${deckId}`,
    warning: "api_key is shown only once. Store it now.",
  }, 201);
});

/** Pulls the bearer token, or returns the 401 response to send instead. */
function requireKey(header: string | null): string | Response {
  const key = extractBearer(header);
  return key ?? errorResponse("unauthorized");
}

deckRoutes.post("/decks/:deckId/slides", async (c) => {
  const key = requireKey(c.req.header("Authorization") ?? null);
  if (key instanceof Response) return key;

  const declared = Number(c.req.header("Content-Length") ?? 0);
  if (declared > L.BODY_BYTES_MAX) return errorResponse("payload_too_large");

  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > L.BODY_BYTES_MAX) {
    return errorResponse("payload_too_large");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return errorResponse("validation_failed", {
      details: [{ path: "", message: "body must be valid JSON" }],
    });
  }

  const parsed = SlideInput.safeParse(parsedJson);
  if (!parsed.success) {
    const details: ErrorDetail[] = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return errorResponse("validation_failed", { details });
  }

  const result = await deckStub(c.env, c.req.param("deckId")).pushSlide(key, parsed.data);
  if (!result.ok) return errorResponse(result.error, { retryAfter: result.retryAfter });

  return c.json(result.value, 201);
});

deckRoutes.get("/decks/:deckId/slides", async (c) => {
  const key = requireKey(c.req.header("Authorization") ?? null);
  if (key instanceof Response) return key;

  const result = await deckStub(c.env, c.req.param("deckId")).listSlides(key);
  if (!result.ok) return errorResponse(result.error);
  return c.json(result.value);
});

deckRoutes.delete("/decks/:deckId/slides", async (c) => {
  const key = requireKey(c.req.header("Authorization") ?? null);
  if (key instanceof Response) return key;

  const result = await deckStub(c.env, c.req.param("deckId")).clearSlides(key);
  if (!result.ok) return errorResponse(result.error);
  return c.json(result.value);
});
