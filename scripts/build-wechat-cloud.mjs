import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function buildWechatCloud({ functionName = "shuokaiGateway" } = {}) {
  if (!["shuokaiGateway", "shuokaiGatewayProduction"].includes(functionName)) throw new Error("未知的微信云函数入口。");
  const destination = `dist/wechat-cloud/cloudfunctions/${functionName}`;
  execFileSync("node", ["node_modules/typescript/bin/tsc", "--project", "wechat-cloud/tsconfig.json", "--outDir", destination], { stdio: "inherit" });
  await mkdir(destination, { recursive: true });
  const sourcePackage = JSON.parse(await readFile("wechat-cloud/package.json", "utf8"));
  await writeFile(`${destination}/package.json`, `${JSON.stringify({ ...sourcePackage, type: "commonjs" }, null, 2)}\n`);
  await copyFile("wechat-cloud/package-lock.json", `${destination}/package-lock.json`);
  await writeFile(`${destination}/index.js`, 'exports.main = require("./wechat-cloud/src/index.js").main;\n');
  await writeFile(`${destination}/config.json`, `${JSON.stringify({ timeout: 60, memorySize: 256, runtime: "Nodejs22.21" }, null, 2)}\n`);
  console.log(`云函数已构建：${destination}（仅代码与锁定依赖，不包含密钥）`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await buildWechatCloud();
