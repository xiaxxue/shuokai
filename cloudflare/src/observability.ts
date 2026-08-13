import type { WorkerEnv } from "./http.ts";

const service = "shuokai-api";
const logSchemaVersion = 1;
const safeCodePattern = /^[A-Z0-9][A-Z0-9_]{0,63}$/;
const safeRayPattern = /^[A-Za-z0-9-]{1,64}$/;
const safeCorrelationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const knownRoutes = new Map([
  ["/health", "health"],
  ["/wechat-login", "wechat_login"],
  ["/miniapp-api", "miniapp_api"],
  ["/room/invitation-context", "invitation_context"],
  ["/ai/expression", "ai_expression"],
  ["/ai/understanding", "ai_understanding"],
  ["/transcribe", "transcribe"],
]);

type LogLevel = "info" | "warn" | "error";

export type LogSink = {
  info(event: Record<string, unknown>): void;
  warn(event: Record<string, unknown>): void;
  error(event: Record<string, unknown>): void;
};

export type RequestLogContext = {
  requestId: string;
  route: string;
  method: string;
  cloudflareRay?: string;
  startedAt: number;
};

function environmentName(env: WorkerEnv) {
  const value = env.APP_ENVIRONMENT?.trim().toLowerCase() ?? "unknown";
  return /^[a-z0-9_-]{1,24}$/.test(value) ? value : "unknown";
}

function methodName(method: string) {
  const normalized = method.toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(normalized)
    ? normalized
    : "OTHER";
}

export function routeName(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  return knownRoutes.get(pathname) ?? "not_found";
}

export function createRequestLogContext(request: Request): RequestLogContext {
  const cloudflareRay = request.headers.get("cf-ray") ?? "";
  return {
    requestId: crypto.randomUUID(),
    route: routeName(request),
    method: methodName(request.method),
    ...(safeRayPattern.test(cloudflareRay) ? { cloudflareRay } : {}),
    startedAt: Date.now(),
  };
}

function emit(level: LogLevel, event: Record<string, unknown>, sink: LogSink = console) {
  try {
    sink[level](event);
  } catch {
    // Observability must never turn a successful user operation into a failure.
  }
}

function baseEvent(env: WorkerEnv, eventName: string) {
  return {
    schema_version: logSchemaVersion,
    timestamp: new Date().toISOString(),
    service,
    environment: environmentName(env),
    event_name: eventName,
  };
}

function safeErrorCode(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toUpperCase();
  return safeCodePattern.test(normalized) ? normalized : fallback;
}

async function responseErrorCode(response: Response) {
  const fallback = `HTTP_${response.status}`;
  if (response.status < 400 || !response.headers.get("content-type")?.includes("application/json")) {
    return response.status < 400 ? undefined : fallback;
  }
  try {
    const body = await response.clone().json() as { code?: unknown };
    return safeErrorCode(body?.code, fallback);
  } catch {
    return fallback;
  }
}

export function logRequestException(
  env: WorkerEnv,
  context: RequestLogContext,
  error: unknown,
  sink?: LogSink,
) {
  const exceptionName = error instanceof Error ? error.name : "UnknownError";
  emit("error", {
    ...baseEvent(env, "request_exception"),
    level: "error",
    request_id: context.requestId,
    route: context.route,
    method: context.method,
    error_code: safeErrorCode(exceptionName.replace(/([a-z])([A-Z])/g, "$1_$2"), "UNHANDLED_EXCEPTION"),
  }, sink);
}

export async function observeResponse(
  env: WorkerEnv,
  context: RequestLogContext,
  response: Response,
  sink?: LogSink,
) {
  const status = response.status;
  const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  const errorCode = await responseErrorCode(response);
  emit(level, {
    ...baseEvent(env, "request_completed"),
    level,
    request_id: context.requestId,
    ...(context.cloudflareRay ? { cloudflare_ray: context.cloudflareRay } : {}),
    route: context.route,
    method: context.method,
    status,
    outcome: status >= 500 ? "server_error" : status >= 400 ? "client_error" : "success",
    ...(errorCode ? { error_code: errorCode } : {}),
    duration_ms: Math.max(0, Date.now() - context.startedAt),
  }, sink);

  const headers = new Headers(response.headers);
  headers.set("x-request-id", context.requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function logQueueBatch(
  env: WorkerEnv,
  summary: {
    batchSize: number;
    succeeded: number;
    retried: number;
    discarded: number;
    durationMs: number;
    failed?: boolean;
  },
  sink?: LogSink,
) {
  const level: LogLevel = summary.failed ? "error" : summary.retried > 0 ? "warn" : "info";
  emit(level, {
    ...baseEvent(env, summary.failed ? "ai_queue_batch_failed" : "ai_queue_batch_completed"),
    level,
    batch_size: summary.batchSize,
    ...(!summary.failed ? {
      succeeded: summary.succeeded,
      retried: summary.retried,
      discarded: summary.discarded,
    } : {}),
    duration_ms: Math.max(0, Math.round(summary.durationMs)),
  }, sink);
}

export function logQueueMessage(
  env: WorkerEnv,
  result: {
    correlationId?: string;
    outcome: "succeeded" | "retried" | "discarded";
    errorCode?: string;
    durationMs: number;
  },
  sink?: LogSink,
) {
  const level: LogLevel = result.outcome === "succeeded" ? "info" : "warn";
  emit(level, {
    ...baseEvent(env, "ai_queue_message_completed"),
    level,
    ...(result.correlationId && safeCorrelationPattern.test(result.correlationId)
      ? { request_id: result.correlationId }
      : {}),
    outcome: result.outcome,
    ...(result.errorCode ? { error_code: safeErrorCode(result.errorCode, "AI_QUEUE_ERROR") } : {}),
    duration_ms: Math.max(0, Math.round(result.durationMs)),
  }, sink);
}
