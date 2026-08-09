import { defineConfig, loadEnv } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const platform = env.UNI_PLATFORM ?? "h5";
  const apiBaseUrl = (env.SHUOKAI_API_BASE_URL ?? "").replace(/\/+$/, "");
  const supabaseUrl = env.SHUOKAI_SUPABASE_URL ?? "";
  const supabasePublishableKey = env.SHUOKAI_SUPABASE_PUBLISHABLE_KEY ?? "";

  if (env.SHUOKAI_API_MODE && env.SHUOKAI_API_MODE !== "live") {
    throw new Error("客户端不再支持 mock/demo 构建；请使用真实测试环境。 ");
  }
  if (platform === "mp-weixin" && !apiBaseUrl) {
    throw new Error("微信正式构建必须设置 SHUOKAI_API_BASE_URL（Cloudflare Worker 域名）。");
  }
  if (platform === "h5" && (!supabaseUrl || !supabasePublishableKey)) {
    throw new Error("H5 正式构建必须设置 Supabase URL 与 publishable key。");
  }

  return {
    plugins: [uni()],
    define: {
      __API_BASE_URL__: JSON.stringify(apiBaseUrl),
      __PLATFORM__: JSON.stringify(platform),
      __SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
    },
  };
});
