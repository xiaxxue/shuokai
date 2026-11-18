import { prepareWechatFromMain } from "./prepare-wechat-from-main.mjs";

try { await prepareWechatFromMain("test"); }
catch (error) {
  console.error(`微信测试交付已停止：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
