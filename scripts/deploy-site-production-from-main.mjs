import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PRODUCTION_HOSTNAME = "shuokai.me";
const SITE_WORKER_NAME = "shuokai-official-site";
const OUTPUT_WRANGLER_CONFIG = "dist/server/wrangler.json";
const ALLOWED_ORIGIN_URLS = new Set([
  "git@github.com:xiaxxue/shuokai.git",
  "https://github.com/xiaxxue/shuokai.git",
]);

function run(command, args, { capture = false, ...options } = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    ...options,
  });
}

function git(args) {
  return run("git", args, { capture: true }).trim();
}

export function validateProductionSiteDeploySource({
  approval,
  branch,
  head,
  originMain,
  originUrl,
  status,
}) {
  if (approval !== PRODUCTION_HOSTNAME) {
    throw new Error(`生产官网部署需要显式设置 SHUOKAI_PRODUCTION_DEPLOY_APPROVED=${PRODUCTION_HOSTNAME}。`);
  }
  if (branch !== "main") {
    throw new Error(`生产官网只能从 main 部署；当前分支是 ${branch || "detached HEAD"}。`);
  }
  if (!ALLOWED_ORIGIN_URLS.has(originUrl)) {
    throw new Error("origin 不是 github.com/xiaxxue/shuokai；拒绝部署未知来源。");
  }
  if (head !== originMain) {
    throw new Error("本地 main 与 origin/main 不一致；必须先推送并确认 GitHub main。");
  }
  if (status.trim()) {
    throw new Error("工作区不干净；生产官网必须来自 GitHub main 的干净检出。");
  }
}

export function validateProductionSiteBuild(configText) {
  const config = JSON.parse(configText);
  if (config.name !== SITE_WORKER_NAME) {
    throw new Error(`构建目标不是 ${SITE_WORKER_NAME}；拒绝覆盖其他 Worker。`);
  }
  if (config.main !== "index.js" || config.assets?.directory !== "../client") {
    throw new Error("官网构建产物不完整；拒绝部署。");
  }
}

export function deployProductionSiteFromMain() {
  run("git", ["fetch", "origin", "main"]);

  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "HEAD"]);
  const originMain = git(["rev-parse", "origin/main"]);
  const originUrl = git(["remote", "get-url", "origin"]);
  const status = git(["status", "--porcelain", "--untracked-files=all"]);
  validateProductionSiteDeploySource({
    approval: process.env.SHUOKAI_PRODUCTION_DEPLOY_APPROVED,
    branch,
    head,
    originMain,
    originUrl,
    status,
  });

  run("npm", ["run", "build"]);
  validateProductionSiteBuild(readFileSync(OUTPUT_WRANGLER_CONFIG, "utf8"));
  run("npx", [
    "wrangler",
    "deploy",
    "--config",
    OUTPUT_WRANGLER_CONFIG,
    "--message",
    `origin/main ${head.slice(0, 12)} official site production`,
  ], {
    env: {
      ...process.env,
      WRANGLER_WRITE_LOGS: "false",
      WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
    },
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  try {
    deployProductionSiteFromMain();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`生产官网部署已停止：${message}`);
    process.exitCode = 1;
  }
}
