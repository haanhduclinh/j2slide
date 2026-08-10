import type { DeckErrorCode } from "./deck-do";

const STATUS: Record<DeckErrorCode | "unauthorized" | "payload_too_large" | "validation_failed", number> = {
  validation_failed: 400,
  unauthorized: 401,
  forbidden: 403,
  deck_not_found: 404,
  payload_too_large: 413,
  rate_limited: 429,
};

export type ErrorCode = keyof typeof STATUS;

export interface ErrorDetail {
  path: string;
  message: string;
}

export function errorResponse(
  code: ErrorCode,
  options: { details?: ErrorDetail[]; retryAfter?: number } = {},
): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.retryAfter !== undefined) headers["Retry-After"] = String(options.retryAfter);

  const body: Record<string, unknown> = { error: code };
  if (options.details) body.details = options.details;

  return new Response(JSON.stringify(body), { status: STATUS[code], headers });
}
