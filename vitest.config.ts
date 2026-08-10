import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { compatibilityDate: "2026-07-01" },
        // DO WebSockets leave SQLite SHM open; isolated storage cannot pop frames.
        // See Cloudflare known issues: WebSockets + per-test isolation unsupported.
        // singleWorker keeps shared storage safe when isolation is off.
        isolatedStorage: false,
        singleWorker: true,
      },
    },
  },
});
