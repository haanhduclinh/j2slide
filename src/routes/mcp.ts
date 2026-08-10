import { Hono } from "hono";
import { extractBearer } from "../auth";
import { deckStub } from "../deck-stub";
import { errorResponse } from "../errors";
import { TOOL_DEFINITIONS } from "../mcp-schemas";
import { SlideInput } from "../schemas";
import type { Env } from "../index";

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "j2slide", version: "1.0.0" };

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const result = (id: unknown, value: unknown) =>
  Response.json({ jsonrpc: "2.0", id, result: value });

const rpcError = (id: unknown, code: number, message: string) =>
  Response.json({ jsonrpc: "2.0", id, error: { code, message } });

/** A tool failure is reported inside the result, so the model can read and retry. */
const toolText = (text: string, isError = false) => ({
  content: [{ type: "text", text }],
  ...(isError ? { isError: true } : {}),
});

export const mcpRoutes = new Hono<{ Bindings: Env }>();

mcpRoutes.post("/mcp/:deckId", async (c) => {
  const apiKey = extractBearer(c.req.header("Authorization") ?? null);
  if (!apiKey) return errorResponse("unauthorized");

  let request: JsonRpcRequest;
  try {
    request = await c.req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const id = request.id ?? null;
  const stub = deckStub(c.env, c.req.param("deckId"));

  switch (request.method) {
    case "initialize": {
      const requested = request.params?.protocolVersion;
      return result(id, {
        // Echo the client's version so a newer client is not turned away.
        protocolVersion: typeof requested === "string" ? requested : DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }

    case "notifications/initialized":
      return new Response(null, { status: 202 });

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, {
        tools: TOOL_DEFINITIONS.map(({ name, description, inputSchema }) => ({
          name, description, inputSchema,
        })),
      });

    case "tools/call": {
      const name = request.params?.name;
      const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
      const tool = TOOL_DEFINITIONS.find((t) => t.name === name);
      if (!tool) return result(id, toolText(`Unknown tool: ${String(name)}`, true));

      if (tool.slideType === null) {
        const cleared = await stub.clearSlides(apiKey);
        if (!cleared.ok) return result(id, toolText(`Cannot clear deck: ${cleared.error}`, true));
        return result(id, toolText(`Cleared ${cleared.value.cleared} slide(s). The deck is now empty.`));
      }

      const parsed = SlideInput.safeParse({ ...args, type: tool.slideType });
      if (!parsed.success) {
        const problems = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ");
        return result(id, toolText(`Invalid arguments — ${problems}`, true));
      }

      const pushed = await stub.pushSlide(apiKey, parsed.data);
      if (!pushed.ok) {
        const suffix = pushed.retryAfter ? ` Retry in ${pushed.retryAfter}s.` : "";
        return result(id, toolText(`Cannot show slide: ${pushed.error}.${suffix}`, true));
      }

      return result(id, toolText(
        `Now showing "${parsed.data.title}" as slide ${pushed.value.index + 1} of ${pushed.value.total}.`,
      ));
    }

    default:
      return rpcError(id, -32601, `Method not found: ${request.method}`);
  }
});

/** No server-initiated streaming, so the GET half of Streamable HTTP is refused. */
mcpRoutes.get("/mcp/:deckId", (c) => c.text("Method Not Allowed", 405));
