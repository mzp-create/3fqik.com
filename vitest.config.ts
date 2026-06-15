import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // PGlite (in-process WASM Postgres) has a multi-second cold start per
    // instance — far slower than the old SQLite :memory: db. Give tests and
    // setup hooks ample headroom so createTestDb() never trips the timeout.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
