import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PRODUCTION_HOSTNAME = "app.shuokai.me";
const PRODUCTION_WORKER_NAME = "shuokai-ai";
const PRODUCTION_QUEUE = "shuokai-ai-jobs-production";
const PRODUCTION_DLQ = "shuokai-ai-jobs-production-dlq";
const PRODUCTION_WRANGLER_CONFIG = "cloudflare/wrangler.jsonc";
const REQUIRED_SECRETS = new Set([
  "SUPABASE_SECRET_KEY",
]);
const PUBLIC_RUNTIME_BINDINGS = new Set([
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
]);
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

export function validateProductionDeploySource({
  approval,
  branch,
  head,
  originMain,
  originUrl,
  status,
}) {
  if (approval !== PRODUCTION_HOSTNAME) {
    throw new Error(`生产 H5 部署需要显式设置 SHUOKAI_PRODUCTION_DEPLOY_APPROVED=${PRODUCTION_HOSTNAME}。`);
  }
  if (branch !== "main") {
    throw new Error(`生产 H5 只能从 main 部署；当前分支是 ${branch || "detached HEAD"}。`);
  }
  if (!ALLOWED_ORIGIN_URLS.has(originUrl)) {
    throw new Error("origin 不是 github.com/xiaxxue/shuokai；拒绝部署未知来源。");
  }
  if (head !== originMain) {
    throw new Error("本地 main 与 origin/main 不一致；必须先推送并确认 GitHub main。");
  }
  if (status.trim()) {
    throw new Error("工作区不干净；生产 H5 必须来自 GitHub main 的干净检出。");
  }
}

export function validateProductionBuildConfiguration({
  supabaseUrl,
  supabasePublishableKey,
  productionProjectRef,
}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("生产 SHUOKAI_SUPABASE_URL 不是有效 URL。");
  }

  const matchedProjectRef = parsedUrl.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1];
  if (parsedUrl.protocol !== "https:" || !matchedProjectRef) {
    throw new Error("生产 SHUOKAI_SUPABASE_URL 必须是 https://<project-ref>.supabase.co。");
  }
  if (!productionProjectRef?.trim() || productionProjectRef.trim() !== matchedProjectRef) {
    throw new Error("SHUOKAI_PRODUCTION_SUPABASE_PROJECT_REF 必须与生产 Supabase URL 完全匹配。");
  }
  if (!supabasePublishableKey?.trim().startsWith("sb_publishable_")) {
    throw new Error("生产 H5 必须使用 Supabase publishable key，不能使用 secret/service-role key。");
  }
}

export function validateProductionWorkerConfig(configText) {
  const normalized = configText.replace(/^\s*\/\/.*$/gm, "");
  const config = JSON.parse(normalized);
  const customDomains = config.routes?.filter((route) => route.custom_domain).map((route) => route.pattern) ?? [];
  const producers = config.queues?.producers ?? [];
  const consumers = config.queues?.consumers ?? [];

  if (config.name !== PRODUCTION_WORKER_NAME || config.vars?.APP_ENVIRONMENT !== "production") {
    throw new Error(`生产配置必须部署 ${PRODUCTION_WORKER_NAME} 且 APP_ENVIRONMENT=production。`);
  }
  if (!customDomains.includes(PRODUCTION_HOSTNAME)) {
    throw new Error(`生产配置必须绑定 ${PRODUCTION_HOSTNAME} Custom Domain。`);
  }
  if (!producers.some(({ binding, queue }) => binding === "AI_JOBS_QUEUE" && queue === PRODUCTION_QUEUE)) {
    throw new Error(`生产配置缺少 ${PRODUCTION_QUEUE} producer。`);
  }
  if (!consumers.some(({ queue, dead_letter_queue: deadLetterQueue }) => (
    queue === PRODUCTION_QUEUE && deadLetterQueue === PRODUCTION_DLQ
  ))) {
    throw new Error(`生产配置缺少 ${PRODUCTION_QUEUE} consumer 或 ${PRODUCTION_DLQ}。`);
  }
}

export function validateProductionSecrets(secretListText) {
  const names = new Set(JSON.parse(secretListText).map(({ name }) => name));
  const missing = [...REQUIRED_SECRETS].filter((name) => !names.has(name));
  if (missing.length) {
    throw new Error(`生产 Worker 缺少 Secrets：${missing.join("、")}。`);
  }
  const shadowedBindings = [...PUBLIC_RUNTIME_BINDINGS].filter((name) => names.has(name));
  if (shadowedBindings.length) {
    throw new Error(`请先删除会遮蔽本次生产配置的旧 Secrets：${shadowedBindings.join("、")}。`);
  }
}

export function deployProductionFromMain() {
  run("git", ["fetch", "origin", "main"]);

  const branch = git(["branch", "--show-current"]);
  const head = git(["rev-parse", "HEAD"]);
  const originMain = git(["rev-parse", "origin/main"]);
  const originUrl = git(["remote", "get-url", "origin"]);
  const status = git(["status", "--porcelain", "--untracked-files=all"]);
  validateProductionDeploySource({
    approval: process.env.SHUOKAI_PRODUCTION_DEPLOY_APPROVED,
    branch,
    head,
    originMain,
    originUrl,
    status,
  });
  validateProductionBuildConfiguration({
    supabaseUrl: process.env.SHUOKAI_SUPABASE_URL,
    supabasePublishableKey: process.env.SHUOKAI_SUPABASE_PUBLISHABLE_KEY,
    productionProjectRef: process.env.SHUOKAI_PRODUCTION_SUPABASE_PROJECT_REF,
  });
  validateProductionWorkerConfig(readFileSync(PRODUCTION_WRANGLER_CONFIG, "utf8"));

  const wranglerEnvironment = {
    ...process.env,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
  };
  const secretList = run("npx", [
    "wrangler",
    "secret",
    "list",
    "--config",
    PRODUCTION_WRANGLER_CONFIG,
  ], { capture: true, env: wranglerEnvironment });
  validateProductionSecrets(secretList);

  run("npm", ["test"]);
  run("npm", ["run", "lint"]);
  run("npm", ["run", "cloudflare:type-check"]);
  run("npm", ["run", "miniapp:type-check"]);
  run("npm", ["--prefix", "miniapp", "run", "build:h5"], {
    env: {
      ...process.env,
      SHUOKAI_SUPABASE_URL: process.env.SHUOKAI_SUPABASE_URL,
      SHUOKAI_SUPABASE_PUBLISHABLE_KEY: process.env.SHUOKAI_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  run("npx", [
    "wrangler",
    "deploy",
    "--config",
    PRODUCTION_WRANGLER_CONFIG,
    "--var",
    "APP_ENVIRONMENT:production",
    "--var",
    `SUPABASE_URL:${process.env.SHUOKAI_SUPABASE_URL}`,
    "--var",
    `SUPABASE_PUBLISHABLE_KEY:${process.env.SHUOKAI_SUPABASE_PUBLISHABLE_KEY}`,
    "--message",
    `origin/main ${head.slice(0, 12)} production H5`,
  ], { env: wranglerEnvironment });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  try {
    deployProductionFromMain();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`生产 H5 部署已停止：${message}`);
    process.exitCode = 1;
  }
}
