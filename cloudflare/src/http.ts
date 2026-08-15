export type WorkerEnv = {
  APP_ENVIRONMENT?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  WECHAT_APP_ID?: string;
  WECHAT_APP_SECRET?: string;
  AI?: {
    run(model: string, input: Record<string, unknown>): Promise<unknown>;
  };
  AI_JOBS_QUEUE?: { send(message: { jobId: string; correlationId: string }): Promise<void> };
  ALLOWED_ORIGINS?: string;
};

export const appErrorCodes = [
  "METHOD_NOT_ALLOWED",
  "AUTH_REQUIRED",
  "ORIGIN_NOT_ALLOWED",
  "NOT_FOUND",
  "INVALID_REQUEST",
  "PAYLOAD_TOO_LARGE",
  "INVALID_ARGUMENTS",
  "UNSUPPORTED_OPERATION",
  "AUTH_SESSION_EXPIRED",
  "SERVICE_NOT_CONFIGURED",
  "INTERNAL_ERROR",
  "DATABASE_REQUEST_FAILED",
  "WORKSPACE_SAVE_FAILED",
  "WORKSPACE_CONFLICT",
  "DATA_SERVICE_INVALID_RESPONSE",
  "INVITATION_CONTEXT_UNAVAILABLE",
  "AI_SERVICE_NOT_CONFIGURED",
  "AI_JOB_CREATE_FAILED",
  "AI_CLARIFICATION_FAILED",
  "PRIVATE_CONVERSATION_CONFLICT",
  "PRIVATE_CONVERSATION_SAVE_FAILED",
  "AI_RATE_LIMITED",
  "AI_QUEUE_UNAVAILABLE",
  "UNDERSTANDING_JOB_CREATE_FAILED",
  "UNDERSTANDING_REQUIRES_REVISION",
  "WECHAT_AUTH_NOT_CONFIGURED",
  "WECHAT_SESSION_EXPIRED",
  "WECHAT_CODE_REQUIRED",
  "WECHAT_IDENTITY_UNAVAILABLE",
  "WECHAT_IDENTITY_INVALID",
  "WECHAT_MAPPING_FAILED",
  "USER_SESSION_CREATE_FAILED",
  "USER_CREATE_FAILED",
  "WECHAT_BIND_FAILED",
  "LOGIN_TOKEN_CREATE_FAILED",
  "LOGIN_SESSION_ISSUE_FAILED",
  "TRANSCRIPTION_SERVICE_NOT_CONFIGURED",
  "AUDIO_TOO_LARGE",
  "AUDIO_REQUIRED",
  "AUDIO_FORMAT_UNSUPPORTED",
  "TRANSCRIPTION_QUOTA_UNAVAILABLE",
  "TRANSCRIPTION_RATE_LIMITED",
  "TRANSCRIPTION_FAILED",
] as const;

export type AppErrorCode = typeof appErrorCodes[number];

export function publicSupabaseConfig(env: WorkerEnv) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

const baseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export function isOriginAllowed(request: Request, env: WorkerEnv) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === new URL(request.url).origin) return true;
  const allowed = new Set(
    (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return allowed.has(origin);
}

function corsHeaders(request: Request, env: WorkerEnv): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !isOriginAllowed(request, env)) return {};
  return {
    "access-control-allow-headers": "authorization, content-type",
    "access-control-expose-headers": "x-request-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": origin,
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export function json(request: Request, env: WorkerEnv, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...baseHeaders, ...corsHeaders(request, env) },
  });
}

export function errorJson(
  request: Request,
  env: WorkerEnv,
  code: AppErrorCode,
  message: string,
  status: number,
  details: Record<string, unknown> = {},
) {
  return json(request, env, { ...details, message, code }, status);
}

export function preflight(request: Request, env: WorkerEnv) {
  if (!isOriginAllowed(request, env)) {
    return errorJson(request, env, "ORIGIN_NOT_ALLOWED", "当前网页来源不被允许。", 403);
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env),
  });
}

export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RangeError("Request body is too large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RangeError("Request body is too large");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  return match ? `Bearer ${match[1]}` : null;
}

export function requireEnv<T extends keyof WorkerEnv>(env: WorkerEnv, keys: readonly T[]) {
  for (const key of keys) {
    if (!env[key]) return null;
  }
  return env as WorkerEnv & Required<Pick<WorkerEnv, T>>;
}
