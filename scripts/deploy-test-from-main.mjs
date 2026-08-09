import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const TEST_WRANGLER_CONFIG = "cloudflare/wrangler.test.jsonc";
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

export function validateTestDeploySource({ branch, head, originMain, originUrl, status }) {
  if (branch !== "main") {
    throw new Error(`测试环境只能从 main 部署；当前分支是 ${branch || "detached HEAD"}。`);
  }
  if (!ALLOWED_ORIGIN_URLS.has(originUrl)) {
    throw new Error("origin 不是 github.com/xiaxxue/shuokai；拒绝部署未知来源。");
  }
  if (head !== originMain) {
    throw new Error("本地 main 与 origin/main 不一致；必须先推送并确认 GitHub main。");
  }
  if (status.trim()) {
    throw new Error("工作区不干净；测试部署必须来自 GitHub main 的干净检出。");
  }
}

function requireBuildConfiguration() {
  if (!process.env.SHUOKAI_SUPABASE_URL?.trim()) {
    throw new Error("缺少测试环境 SHUOKAI_SUPABASE_URL。");
  }
  if (!process.env.SHUOKAI_SUPABASE_PUBLISHABLE_KEY?.trim()) {
    throw new Error("缺少测试环境 SHUOKAI_SUPABASE_PUBLISHABLE_KEY。");
  }
}

export function deployTestFromMain() {
  run("git", ["fetch", "origin", "main"]);

  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "HEAD"]);
  const originMain = git(["rev-parse", "origin/main"]);
  const originUrl = git(["remote", "get-url", "origin"]);
  const status = git(["status", "--porcelain", "--untracked-files=all"]);
  validateTestDeploySource({ branch, head, originMain, originUrl, status });
  requireBuildConfiguration();

  run("npm", ["test"]);
  run("npm", ["run", "lint"]);
  run("npm", ["run", "cloudflare:type-check"]);
  run("npm", ["run", "miniapp:type-check"]);
  run("npm", ["--prefix", "miniapp", "run", "build:h5"]);
  run("npx", [
    "wrangler",
    "deploy",
    "--config",
    TEST_WRANGLER_CONFIG,
    "--message",
    `origin/main ${head.slice(0, 12)} test only`,
  ]);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  try {
    deployTestFromMain();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`测试部署已停止：${message}`);
    process.exitCode = 1;
  }
}
