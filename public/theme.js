/** Design tokens shared by every renderer. Values are plain strings so the
 *  renderers stay pure and their output is easy to assert. */

const TYPE = {
  titleSize: 56,
  footerSize: 24,
  labelSize: 22,
  valueSize: 24,
  bulletMaxSize: 40,
  bulletMinSize: 24,
  kpiValueSize: 92,
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

/**
 * Categorical series colours: 8 distinct hues, legible on both dark and light
 * backgrounds (no pure black/white members; warm amber rather than yellow for
 * light-bg contrast). Indexed modulo length in the renderers.
 */
export const THEMES = {
  dark: {
    name: "dark",
    bg: "#12151c",
    fg: "#f2f4f8",
    muted: "#8b93a7",
    grid: "#262b36",
    accent: "#5b8cff",
    up: "#3fbf7f",
    down: "#f2555a",
    series: ["#5b8cff", "#3fbf7f", "#f2b23f", "#f2555a", "#a97bf5", "#3fc6d4", "#f27fb0", "#9aa7bd"],
    ...TYPE,
  },
  light: {
    name: "light",
    bg: "#ffffff",
    fg: "#151922",
    muted: "#5c6577",
    grid: "#e4e8ef",
    accent: "#2d5fd8",
    up: "#1d8f57",
    down: "#c62f36",
    series: ["#2d5fd8", "#1d8f57", "#b8801a", "#c62f36", "#7a4fd0", "#1e94a3", "#c4548a", "#5c6577"],
    ...TYPE,
  },
};
