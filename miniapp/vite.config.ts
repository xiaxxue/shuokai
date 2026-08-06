import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

const useMockApi = process.env.SHUOKAI_API_MODE !== "live";
const platform = process.env.UNI_PLATFORM ?? "h5";
const apiBaseUrl = (process.env.SHUOKAI_API_BASE_URL ?? "").replace(/\/+$/, "");
const supabaseUrl = process.env.SHUOKAI_SUPABASE_URL ?? "";
const supabasePublishableKey = process.env.SHUOKAI_SUPABASE_PUBLISHABLE_KEY ?? "";

if (!useMockApi && platform === "mp-weixin" && !apiBaseUrl) {
  throw new Error("微信正式构建必须设置 SHUOKAI_API_BASE_URL（Cloudflare Worker 域名）。");
}
if (!useMockApi && platform === "h5" && (!supabaseUrl || !supabasePublishableKey)) {
  throw new Error("H5 正式构建必须设置 Supabase URL 与 publishable key。");
}

export default defineConfig({
  plugins: [uni()],
  define: {
    __API_BASE_URL__: JSON.stringify(apiBaseUrl),
    __USE_MOCK_API__: JSON.stringify(useMockApi),
    __PLATFORM__: JSON.stringify(platform),
    __SUPABASE_URL__: JSON.stringify(supabaseUrl),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
  },
});
