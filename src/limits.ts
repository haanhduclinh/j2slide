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
  /**
   * Max points on bar/line charts. Sized for common time series (≈3 months of
   * daily points). Beyond this, agents should downsample or split slides.
   */
  SERIES_MAX: 90,
  PIE_MAX: 8,
  BULLET_MAX: 120,
  BULLETS_MAX: 8,
  KPI_MAX: 4,
  KPI_VALUE_MAX: 12,
  KPI_DELTA_MAX: 10,

  /** Multi-series charts (`area`, `stacked_bar`) — same density as bar/line. */
  CATEGORIES_MAX: 90,
  MULTI_SERIES_MAX: 6,

  TABLE_COLS_MAX: 6,
  TABLE_ROWS_MAX: 12,
  TABLE_CELL_MAX: 32,

  SCATTER_MAX: 40,

  BODY_BYTES_MAX: 32 * 1024,
  SLIDE_CAP: 200,
  RATE_LIMIT_PER_MIN: 60,
  RATE_WINDOW_MS: 60_000,
  /** After this long without a successful push, all slides are deleted. */
  EXPIRY_MS: 2 * 60 * 60 * 1000,
} as const;
