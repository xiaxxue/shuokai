import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __WECHAT_CLOUD_ENV__: JSON.stringify("shuokai-test-environment"),
    __WECHAT_CLOUD_FUNCTION__: JSON.stringify("shuokaiGateway"),
    __API_BASE_URL__: JSON.stringify("https://api.example.test"),
    __PLATFORM__: JSON.stringify("h5"),
    __SUPABASE_URL__: JSON.stringify("https://project.example.test"),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify("sb_publishable_test"),
  },
  test: {
    environment: "node",
    include: ["tests/auth.h5.test.ts"],
  },
});
