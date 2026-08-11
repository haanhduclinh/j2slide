/**
 * Single source of truth for every documented limit.
 *
 * Zod schemas, the MCP JSON Schema and the Durable Object all derive their
 * bounds from here so the API can never advertise a limit it does not enforce.
 */
export const L = {
  TITLE_MAX: 80,
  LABEL_MAX: 24,
  UNIT_MAX: 8,
  SERIES_MAX: 12,
  PIE_MAX: 8,
  BULLET_MAX: 120,
  BULLETS_MAX: 8,
  KPI_MAX: 4,
  KPI_VALUE_MAX: 12,
  KPI_DELTA_MAX: 10,

  BODY_BYTES_MAX: 32 * 1024,
  SLIDE_CAP: 200,
  RATE_LIMIT_PER_MIN: 60,
  RATE_WINDOW_MS: 60_000,
  /** After this long without a successful push, all slides are deleted. */
  EXPIRY_MS: 2 * 60 * 60 * 1000,
} as const;
