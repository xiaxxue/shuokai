import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __API_BASE_URL__: JSON.stringify("https://api.example.test"),
    __USE_MOCK_API__: false,
    __PLATFORM__: JSON.stringify("h5"),
    __SUPABASE_URL__: JSON.stringify("https://project.example.test"),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify("sb_publishable_test"),
  },
  test: {
    environment: "node",
    include: ["tests/auth.h5.test.ts"],
  },
});
