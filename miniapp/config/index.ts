import type { UserConfigExport } from "@tarojs/cli";

const config: UserConfigExport = {
  projectName: "shuokai-miniapp",
  date: "2026-08-06",
  designWidth: 390,
  deviceRatio: {
    390: 2,
    750: 1,
  },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "webpack5",
  cache: { enable: true },
  plugins: ["@tarojs/plugin-framework-react"],
  defineConstants: {
    __API_BASE_URL__: JSON.stringify(
      process.env.SHUOKAI_API_BASE_URL ??
        "https://pwpcisztfnukjnavszgv.supabase.co/functions/v1",
    ),
    __USE_MOCK_API__: JSON.stringify(process.env.SHUOKAI_API_MODE !== "live"),
  },
  mini: {
    postcss: {
      pxtransform: { enable: true },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: { enable: false },
    },
  },
};

export default config;
