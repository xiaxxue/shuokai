import { defineConfig, loadEnv } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const platform = env.UNI_PLATFORM ?? "h5";
  const cloudEnv = env.SHUOKAI_WECHAT_CLOUD_ENV?.trim() ?? "";
  const cloudFunction = env.SHUOKAI_WECHAT_CLOUD_FUNCTION?.trim() || "shuokaiGateway";
  const apiBaseUrl = (env.SHUOKAI_API_BASE_URL ?? "").replace(/\/+$/, "");
  const supabaseUrl = env.SHUOKAI_SUPABASE_URL ?? "";
  const supabasePublishableKey = env.SHUOKAI_SUPABASE_PUBLISHABLE_KEY ?? "";

  if (env.SHUOKAI_API_MODE && env.SHUOKAI_API_MODE !== "live") {
    throw new Error("客户端不再支持 mock/demo 构建；请使用真实测试环境。 ");
  }
  if (platform === "mp-weixin" && !/^[a-z][a-z0-9-]{5,100}$/i.test(cloudEnv)) {
    throw new Error("微信构建必须设置真实 SHUOKAI_WECHAT_CLOUD_ENV（云开发环境 ID）。");
  }
  if (platform === "mp-weixin" && !["shuokaiGateway", "shuokaiGatewayProduction"].includes(cloudFunction)) {
    throw new Error("微信云函数名称必须是已知的测试或正式入口。");
  }
  if (platform === "h5" && (!supabaseUrl || !supabasePublishableKey)) {
    throw new Error("H5 正式构建必须设置 Supabase URL 与 publishable key。");
  }

  return {
    plugins: [uni()],
    define: {
      __API_BASE_URL__: JSON.stringify(platform === "mp-weixin" ? "" : apiBaseUrl),
      __WECHAT_CLOUD_ENV__: JSON.stringify(cloudEnv),
      __WECHAT_CLOUD_FUNCTION__: JSON.stringify(cloudFunction),
      __PLATFORM__: JSON.stringify(platform),
      __SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
    },
  };
});
