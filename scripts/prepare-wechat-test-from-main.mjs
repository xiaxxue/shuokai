import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateTestDeploySource } from "./deploy-test-from-main.mjs";
import { buildWechatCloud } from "./build-wechat-cloud.mjs";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export async function prepareWechatTestFromMain() {
  git(["fetch", "origin", "main"]);
  const head = git(["rev-parse", "HEAD"]);
  validateTestDeploySource({
    branch: git(["branch", "--show-current"]),
    head,
    originMain: git(["rev-parse", "origin/main"]),
    originUrl: git(["remote", "get-url", "origin"]),
    status: git(["status", "--porcelain", "--untracked-files=all"]),
  });
  const appId = process.env.SHUOKAI_WECHAT_APP_ID?.trim();
  const cloudEnv = process.env.SHUOKAI_WECHAT_CLOUD_ENV?.trim();
  if (!/^wx[0-9a-f]{16}$/i.test(appId ?? "") || !/^[a-z][a-z0-9-]{5,100}$/i.test(cloudEnv ?? "")) {
    throw new Error("必须提供真实的小程序 AppID 与测试云开发环境 ID。");
  }
  await buildWechatCloud();
  execFileSync("npm", ["run", "miniapp:build"], { stdio: "inherit" });
  // Each source commit gets its own immutable directory; never mix files from older builds.
  const destination = `dist/wechat-experience-${head.slice(0, 12)}`;
  await mkdir(destination);
  await cp("miniapp/dist/build/mp-weixin", `${destination}/miniprogram`, { recursive: true });
  await cp("dist/wechat-cloud/cloudfunctions", `${destination}/cloudfunctions`, { recursive: true });
  const project = JSON.parse(await readFile(`${destination}/miniprogram/project.config.json`, "utf8"));
  await writeFile(`${destination}/project.config.json`, `${JSON.stringify({
    ...project,
    projectname: "说开-云函数体验版",
    miniprogramRoot: "miniprogram/",
    cloudfunctionRoot: "cloudfunctions/",
    setting: { ...project.setting, urlCheck: true },
  }, null, 2)}\n`);
  await writeFile(`${destination}/build-manifest.json`, `${JSON.stringify({
    source: "github.com/xiaxxue/shuokai", branch: "main", commit: head,
    environment: "test", appId, cloudEnv, cloudFunction: "shuokaiGateway",
    backend: "https://shuokai-supabase-test.shuokai.workers.dev",
  }, null, 2)}\n`);
  await writeFile(`${destination}/cloudbaserc.json`, `${JSON.stringify({
    envId: cloudEnv,
    functionRoot: "cloudfunctions",
    functions: [{
      name: "shuokaiGateway", handler: "index.main", runtime: "Nodejs22.21",
      timeout: 60, memorySize: 256, installDependency: true,
    }],
  }, null, 2)}\n`);
  console.log(`测试交付目录：${destination}；请先部署云函数、配置测试 Supabase，再上传小程序。`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try { await prepareWechatTestFromMain(); }
  catch (error) {
    console.error(`微信测试交付已停止：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
