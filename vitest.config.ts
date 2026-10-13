import { defineConfig } from "vitest/config";

// Unit tests for the pure logic (link parsing, result routing). They run in Node.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
