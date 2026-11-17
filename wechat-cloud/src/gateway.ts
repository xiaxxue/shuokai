import {
  issueWechatSession,
  refreshWechatSession,
  WechatSessionError,
} from "../../server/wechat-session.ts";

type Environment = Record<string, string | undefined>;
type WechatContext = { OPENID?: string; APPID?: string; UNIONID?: string };
type GatewayResponse = { statusCode: number; data: unknown };
type Dependencies = {
  fetch: typeof fetch;
  issueSession: typeof issueWechatSession;
  refreshSession: typeof refreshWechatSession;
};

const TEST_BACKEND = "https://shuokai-supabase-test.shuokai.workers.dev";
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const JSON_PATHS = new Set([
  "/miniapp-api", "/room/invitation-context", "/ai/expression", "/ai/clarify", "/ai/understanding",
]);

function failure(statusCode: number, code: string, message: string): GatewayResponse {
  return { statusCode, data: { code, message } };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function handleGateway(
  event: unknown,
  identity: WechatContext,
  env: Environment,
  dependencies: Dependencies = {
    fetch: globalThis.fetch,
    issueSession: issueWechatSession,
    refreshSession: refreshWechatSession,
  },
): Promise<GatewayResponse> {
  if (env.APP_ENVIRONMENT !== "test" || env.SHUOKAI_BACKEND_URL !== TEST_BACKEND ||
      !/^wx[0-9a-f]{16}$/i.test(env.WECHAT_APP_ID ?? "")) {
    return failure(503, "SERVICE_NOT_CONFIGURED", "小程序云服务尚未配置。");
  }
  if (!identity.OPENID || identity.APPID !== env.WECHAT_APP_ID) {
    return failure(401, "AUTH_REQUIRED", "请通过说开小程序访问。");
  }
  if (!record(event) || typeof event.path !== "string" ||
      (event.method !== "POST" && !(event.path === "/health" && event.method === "GET"))) {
    return failure(400, "INVALID_REQUEST", "请求格式无效。");
  }
  const { path } = event;
  if (path !== "/wechat-login" && path !== "/transcribe" && path !== "/health" && !JSON_PATHS.has(path)) {
    return failure(404, "NOT_FOUND", "请求的服务不存在。");
  }

  try {
    if (path === "/wechat-login") {
      if (!record(event.data) || Buffer.byteLength(JSON.stringify(event.data)) > 16 * 1024) {
        return failure(400, "INVALID_REQUEST", "登录请求格式无效。");
      }
      const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishableKey, SUPABASE_SECRET_KEY: secretKey } = env;
      if (!url || !publishableKey || !secretKey || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
        return failure(503, "WECHAT_AUTH_NOT_CONFIGURED", "微信登录尚未配置。");
      }
      const config = { url, publishableKey, secretKey };
      const refreshToken = event.data.refreshToken;
      if (refreshToken !== undefined && (typeof refreshToken !== "string" || !refreshToken.trim() || refreshToken.length > 8192)) {
        return failure(400, "INVALID_REQUEST", "登录请求格式无效。");
      }
      const data = typeof refreshToken === "string"
        ? await dependencies.refreshSession(config, refreshToken)
        : await dependencies.issueSession(config, { openid: identity.OPENID, unionid: identity.UNIONID });
      return { statusCode: 200, data };
    }

    const headers: Record<string, string> = {};
    if (path !== "/health") {
      if (typeof event.authorization !== "string" || !/^Bearer [^\s]{1,8192}$/.test(event.authorization)) {
        return failure(401, "AUTH_REQUIRED", "请先登录。");
      }
      // The Worker verifies this Supabase user JWT and retains the existing RLS/RPC boundary.
      headers.authorization = event.authorization;
    }
    let body: string | FormData | undefined;
    if (path === "/transcribe") {
      if (!record(event.data) || typeof event.data.audioBase64 !== "string") {
        return failure(400, "AUDIO_REQUIRED", "没有收到录音文件。");
      }
      const encoded = event.data.audioBase64;
      if (encoded.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4) {
        return failure(413, "AUDIO_TOO_LARGE", "录音文件过大，请缩短录音后重试。");
      }
      if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        return failure(400, "AUDIO_FORMAT_UNSUPPORTED", "录音文件格式无效。");
      }
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.length > MAX_AUDIO_BYTES || bytes.toString("base64") !== encoded) {
        return failure(400, "AUDIO_FORMAT_UNSUPPORTED", "录音文件格式无效。");
      }
      body = new FormData();
      body.append("file", new Blob([bytes], { type: "audio/mpeg" }), "recording.mp3");
      body.append("language", "zh");
    } else if (path !== "/health") {
      if (!record(event.data)) return failure(400, "INVALID_REQUEST", "请求格式无效。");
      body = JSON.stringify(event.data);
      if (Buffer.byteLength(body) > 256 * 1024) return failure(413, "PAYLOAD_TOO_LARGE", "提交的内容过大。");
      headers["content-type"] = "application/json";
    }

    // Leave time to return a useful error before the native cloud function's 60s limit.
    const timeout = path === "/transcribe" || path === "/ai/clarify" ? 55000 : 25000;
    const response = await dependencies.fetch(`${TEST_BACKEND}${path}`, {
      method: event.method,
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
    });
    // Bound untrusted upstream responses before parsing; never forward headers or cookies.
    const reader = response.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 1024 * 1024) {
            await reader.cancel();
            return failure(502, "DATA_SERVICE_INVALID_RESPONSE", "服务返回的内容过大，请稍后重试。");
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return { statusCode: response.status, data };
  } catch (error) {
    if (error instanceof WechatSessionError) return failure(error.status, error.code, error.message);
    if (error instanceof Error && /Timeout|Abort/.test(error.name)) {
      return failure(504, "UPSTREAM_TIMEOUT", "服务响应超时，请稍后重试。");
    }
    // Do not log events, tokens, openids, user text, audio, or provider error objects.
    return failure(502, "SERVICE_UNAVAILABLE", "云服务暂时无法连接，请稍后重试。");
  }
}
