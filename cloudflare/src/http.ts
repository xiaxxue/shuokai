export type WorkerEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  WECHAT_APP_ID?: string;
  WECHAT_APP_SECRET?: string;
  OPENAI_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
};

export function publicSupabaseConfig(env: WorkerEnv) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;
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

export function preflight(request: Request, env: WorkerEnv) {
  if (!isOriginAllowed(request, env)) {
    return json(request, env, { message: "当前网页来源不被允许。" }, 403);
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
  return authorization?.startsWith("Bearer ") ? authorization : null;
}

export function requireEnv<T extends keyof WorkerEnv>(env: WorkerEnv, keys: readonly T[]) {
  for (const key of keys) {
    if (!env[key]) return null;
  }
  return env as WorkerEnv & Required<Pick<WorkerEnv, T>>;
}
