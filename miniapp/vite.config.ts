import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

const defaultApiBaseUrl = "https://pwpcisztfnukjnavszgv.supabase.co/functions/v1";

export default defineConfig({
  plugins: [uni()],
  define: {
    __API_BASE_URL__: JSON.stringify(process.env.SHUOKAI_API_BASE_URL ?? defaultApiBaseUrl),
    __USE_MOCK_API__: JSON.stringify(process.env.SHUOKAI_API_MODE !== "live"),
    __PLATFORM__: JSON.stringify(process.env.UNI_PLATFORM ?? "h5"),
    __SUPABASE_URL__: JSON.stringify(process.env.SHUOKAI_SUPABASE_URL ?? ""),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(process.env.SHUOKAI_SUPABASE_PUBLISHABLE_KEY ?? ""),
  },
});
