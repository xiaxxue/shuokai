import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __API_BASE_URL__: JSON.stringify("https://example.test/functions/v1"),
    __USE_MOCK_API__: false,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
