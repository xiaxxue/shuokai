import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __API_BASE_URL__: JSON.stringify("https://example.test/functions/v1"),
    __USE_MOCK_API__: false,
    __PLATFORM__: JSON.stringify("mp-weixin"),
    __SUPABASE_URL__: JSON.stringify(""),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(""),
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/auth.h5.test.ts"],
  },
});
