import {
  handleExpressionJob,
  handleMiniappApi,
  handleTranscribe,
  handleUnderstandingJob,
  handleWechatLogin,
} from "./handlers.ts";
import { processExpressionQueue, type QueueBatch } from "./expression-ai.ts";
import { isOriginAllowed, json, preflight, type WorkerEnv } from "./http.ts";
import {
  createRequestLogContext,
  logRequestException,
  observeResponse,
} from "./observability.ts";

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const context = createRequestLogContext(request);
  let response: Response;
  try {
    if (request.method === "OPTIONS") {
      response = preflight(request, env);
    } else if (!isOriginAllowed(request, env)) {
      response = json(request, env, { message: "当前网页来源不被允许。" }, 403);
    } else {
      const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
      if (pathname === "/health" && request.method === "GET") {
        response = json(request, env, { ok: true, service: "shuokai-api" });
      } else if (pathname === "/wechat-login") {
        response = await handleWechatLogin(request, env);
      } else if (pathname === "/miniapp-api") {
        response = await handleMiniappApi(request, env);
      } else if (pathname === "/ai/expression") {
        response = await handleExpressionJob(request, env);
      } else if (pathname === "/ai/understanding") {
        response = await handleUnderstandingJob(request, env);
      } else if (pathname === "/transcribe") {
        response = await handleTranscribe(request, env);
      } else {
        response = json(request, env, { message: "Not found" }, 404);
      }
    }
  } catch (error) {
    logRequestException(env, context, error);
    response = json(request, env, { message: "服务暂时不可用，请稍后重试。" }, 500);
  }
  return observeResponse(env, context, response);
}

const worker = {
  fetch: handleRequest,
  queue: processExpressionQueue as (batch: QueueBatch, env: WorkerEnv) => Promise<void>,
};

export default worker;
