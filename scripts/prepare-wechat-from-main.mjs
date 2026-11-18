import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { validateTestDeploySource } from "./deploy-test-from-main.mjs";
import { buildWechatCloud } from "./build-wechat-cloud.mjs";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function validateWechatBuildConfiguration({ environment, appId, cloudEnv, productionApproval, productionProjectRef }) {
  if (environment !== "test" && environment !== "production") throw new Error("必须明确选择微信测试或正式环境。");
  if (!/^wx[0-9a-f]{16}$/i.test(appId ?? "") || !/^[a-z][a-z0-9-]{5,100}$/i.test(cloudEnv ?? "")) {
    throw new Error("必须提供真实的小程序 AppID 与云开发环境 ID。");
  }
  const production = environment === "production";
  if (production && (appId !== "wx30bafbe48a0f4d4b" || productionApproval !== appId || productionProjectRef !== "jmktnjeefvwailfcrljz")) {
    throw new Error("正式微信交付需要授权对应 AppID，并确认正式 Supabase 项目 jmktnjeefvwailfcrljz。");
  }
  return {
    environment, appId, cloudEnv,
    functionName: production ? "shuokaiGatewayProduction" : "shuokaiGateway",
    backend: production ? "https://app.shuokai.me" : "https://shuokai-supabase-test.shuokai.workers.dev",
    supabaseUrl: production ? "https://jmktnjeefvwailfcrljz.supabase.co" : "https://pwpcisztfnukjnavszgv.supabase.co",
  };
}

export async function prepareWechatFromMain(environment) {
  const target = validateWechatBuildConfiguration({
    environment,
    appId: process.env.SHUOKAI_WECHAT_APP_ID?.trim(),
    cloudEnv: process.env.SHUOKAI_WECHAT_CLOUD_ENV?.trim(),
    productionApproval: process.env.SHUOKAI_WECHAT_PRODUCTION_APPROVED?.trim(),
    productionProjectRef: process.env.SHUOKAI_PRODUCTION_SUPABASE_PROJECT_REF?.trim(),
  });
  git(["fetch", "origin", "main"]);
  const head = git(["rev-parse", "HEAD"]);
  validateTestDeploySource({
    branch: git(["branch", "--show-current"]),
    head,
    originMain: git(["rev-parse", "origin/main"]),
    originUrl: git(["remote", "get-url", "origin"]),
    status: git(["status", "--porcelain", "--untracked-files=all"]),
  });
  const { appId, cloudEnv, functionName, backend, supabaseUrl } = target;
  await buildWechatCloud({ functionName });
  execFileSync("npm", ["run", "miniapp:build"], {
    stdio: "inherit",
    env: {
      ...process.env, SHUOKAI_WECHAT_CLOUD_FUNCTION: functionName,
      // Native requests use the cloud function; no direct database configuration is bundled.
      SHUOKAI_SUPABASE_URL: "", SHUOKAI_SUPABASE_PUBLISHABLE_KEY: "", SHUOKAI_API_BASE_URL: "",
    },
  });
  // Each source commit gets its own immutable directory; never mix files from older builds.
  const destination = `dist/wechat-${environment === "production" ? "production" : "experience"}-${head.slice(0, 12)}`;
  await mkdir(destination);
  await cp("miniapp/dist/build/mp-weixin", `${destination}/miniprogram`, { recursive: true });
  await cp(`dist/wechat-cloud/cloudfunctions/${functionName}`, `${destination}/cloudfunctions/${functionName}`, { recursive: true });
  const project = JSON.parse(await readFile(`${destination}/miniprogram/project.config.json`, "utf8"));
  await writeFile(`${destination}/project.config.json`, `${JSON.stringify({
    ...project,
    projectname: environment === "production" ? "说开-正式云服务" : "说开-云函数体验版",
    miniprogramRoot: "miniprogram/",
    cloudfunctionRoot: "cloudfunctions/",
    setting: { ...project.setting, urlCheck: true },
  }, null, 2)}\n`);
  await writeFile(`${destination}/build-manifest.json`, `${JSON.stringify({
    source: "github.com/xiaxxue/shuokai", branch: "main", commit: head,
    environment, appId, cloudEnv, cloudFunction: functionName, backend, supabaseUrl,
  }, null, 2)}\n`);
  await writeFile(`${destination}/cloudbaserc.json`, `${JSON.stringify({
    envId: cloudEnv,
    functionRoot: "cloudfunctions",
    functions: [{
      name: functionName, handler: "index.main", runtime: "Nodejs22.21",
      timeout: 60, memorySize: 256, installDependency: true,
    }],
  }, null, 2)}\n`);
  console.log(`微信 ${environment} 交付目录：${destination}；请先部署 ${functionName}、配置对应 Supabase，再上传小程序。`);
}
