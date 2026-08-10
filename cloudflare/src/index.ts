import {
  handleExpressionJob,
  handleMiniappApi,
  handleTranscribe,
  handleWechatLogin,
} from "./handlers.ts";
import { processExpressionQueue, type QueueBatch } from "./expression-ai.ts";
import { isOriginAllowed, json, preflight, type WorkerEnv } from "./http.ts";

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);
  if (!isOriginAllowed(request, env)) {
    return json(request, env, { message: "当前网页来源不被允许。" }, 403);
  }

  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  try {
    if (pathname === "/health" && request.method === "GET") {
      return json(request, env, { ok: true, service: "shuokai-api" });
    }
    if (pathname === "/wechat-login") return handleWechatLogin(request, env);
    if (pathname === "/miniapp-api") return handleMiniappApi(request, env);
    if (pathname === "/ai/expression") return handleExpressionJob(request, env);
    if (pathname === "/transcribe") return handleTranscribe(request, env);
    return json(request, env, { message: "Not found" }, 404);
  } catch {
    return json(request, env, { message: "服务暂时不可用，请稍后重试。" }, 500);
  }
}

const worker = {
  fetch: handleRequest,
  queue: processExpressionQueue as (batch: QueueBatch, env: WorkerEnv) => Promise<void>,
};

export default worker;
