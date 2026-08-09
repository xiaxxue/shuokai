import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const appId = process.env.SHUOKAI_WECHAT_APP_ID?.trim() ?? "";

if (!/^wx[a-f0-9]{16}$/i.test(appId)) {
  throw new Error(
    "微信 Live 构建必须设置真实 SHUOKAI_WECHAT_APP_ID（wx 开头的 18 位 AppID）。",
  );
}

await new Promise((resolve, reject) => {
  const child = spawn("uni", ["build", "-p", "mp-weixin"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`微信构建失败（code=${code ?? "null"}, signal=${signal ?? "none"}）。`));
  });
});

const projectConfigPath = new URL("../dist/build/mp-weixin/project.config.json", import.meta.url);
const projectConfig = JSON.parse(await readFile(projectConfigPath, "utf8"));
projectConfig.appid = appId;
await writeFile(projectConfigPath, `${JSON.stringify(projectConfig, null, 2)}\n`, "utf8");

if ((await readFile(projectConfigPath, "utf8")).includes("touristappid")) {
  throw new Error("微信构建产物仍包含 touristappid，已拒绝交付。 ");
}
