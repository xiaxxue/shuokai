import { createClient } from "@supabase/supabase-js";
import {
  bearerToken,
  json,
  publicSupabaseConfig,
  readJson,
  requireEnv,
  type WorkerEnv,
} from "./http.ts";
import { isAllowedRpcMethod, validateRpcArgs } from "./rpc-validation.ts";
import { isSupportedExpressionMode } from "./expression-ai.ts";

const safeDatabaseMessages: Record<string, string> = {
  "40001": "房间刚刚发生了变化，请刷新后重试。",
  "42501": "你没有执行这个操作的权限。",
  P0001: "提交的内容不符合当前操作要求。",
  P0002: "沟通房间不存在或已经失效。",
  P0003: "AI 整理请求过于频繁，请稍后再试。",
  "23505": "这个房间已经有另一位参与者。",
  "55000": "当前沟通阶段不能执行这个操作。",
};

function userClient(config: { url: string; key: string }, authorization: string) {
  return createClient(config.url, config.key, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function adminClient(env: Required<Pick<WorkerEnv, "SUPABASE_URL" | "SUPABASE_SECRET_KEY">>) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifiedUserId(
  supabase: ReturnType<typeof userClient>,
  authorization: string,
) {
  const jwt = authorization.slice("Bearer ".length);
  const { data, error } = await supabase.auth.getClaims(jwt);
  const subject = data?.claims?.sub;
  return error || typeof subject !== "string" ? null : subject;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleExpressionJob(request: Request, env: WorkerEnv) {
  if (request.method !== "POST") return json(request, env, { message: "Method not allowed" }, 405);
  const authorization = bearerToken(request);
  if (!authorization) return json(request, env, { message: "请先登录。" }, 401);
  const config = publicSupabaseConfig(env);
  if (!config || !env.SUPABASE_SECRET_KEY || !env.OPENAI_API_KEY || !env.AI_JOBS_QUEUE) {
    return json(request, env, {
      message: "AI 整理服务尚未配置，请先手动填写。",
      code: "AI_SERVICE_NOT_CONFIGURED",
    }, 503);
  }
  let body: unknown;
  try {
    body = await readJson(request, 32 * 1024);
  } catch (error) {
    return json(request, env, { message: "请求格式无效。" }, error instanceof RangeError ? 413 : 400);
  }
  if (!body || typeof body !== "object") return json(request, env, { message: "请求格式无效。" }, 400);
  const input = body as {
    roomId?: unknown;
    expectedRevision?: unknown;
    sourceText?: unknown;
    selectedMode?: unknown;
    manualPayload?: unknown;
  };
  if (typeof input.roomId !== "string" || !uuidPattern.test(input.roomId) ||
    typeof input.expectedRevision !== "number" || !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 || typeof input.sourceText !== "string" ||
    !input.sourceText.trim() || input.sourceText.length > 12000 ||
    !isSupportedExpressionMode(input.selectedMode) ||
    (input.manualPayload !== undefined && (
      !input.manualPayload || typeof input.manualPayload !== "object" || Array.isArray(input.manualPayload)
    ))) {
    return json(request, env, { message: "操作参数无效。" }, 400);
  }

  const supabase = userClient(config, authorization);
  if (!await verifiedUserId(supabase, authorization)) {
    return json(request, env, { message: "登录已失效。" }, 401);
  }
  const normalizedSource = input.sourceText.trim();
  const { data: saved, error: saveError } = await supabase.rpc("save_expression_workspace_v2", {
    p_room_id: input.roomId,
    p_expected_revision: input.expectedRevision,
    p_source_text: normalizedSource,
    p_selected_mode: input.selectedMode,
    p_manual_payload: input.manualPayload ?? {},
  });
  let revision = saved && typeof saved === "object" ? (saved as { revision?: unknown }).revision : null;
  if (saveError?.code === "40001") {
    const { data: current } = await supabase.rpc("get_expression_workspace_v2", { p_room_id: input.roomId });
    const sameSavedRequest = current && typeof current === "object" &&
      (current as { sourceText?: unknown }).sourceText === normalizedSource &&
      (current as { selectedMode?: unknown }).selectedMode === input.selectedMode;
    revision = sameSavedRequest ? (current as { revision?: unknown }).revision : null;
  } else if (saveError) {
    const code = saveError.code ?? "SAVE_FAILED";
    return json(request, env, {
      message: safeDatabaseMessages[code] ?? "表达草稿没有保存，请稍后重试。",
      code,
    }, 400);
  }
  if (typeof revision !== "number") {
    if (saveError?.code === "40001") {
      return json(request, env, {
        message: safeDatabaseMessages["40001"],
        code: "40001",
      }, 409);
    }
    return json(request, env, { message: "数据服务返回了无效结果。" }, 502);
  }
  const { data: job, error: jobError } = await supabase.rpc("request_understanding_job_v2", {
    p_room_id: input.roomId,
    p_expected_revision: revision,
  });
  const jobId = job && typeof job === "object" ? (job as { jobId?: unknown }).jobId : null;
  if (jobError) {
    return json(request, env, {
      message: safeDatabaseMessages[jobError.code] ?? "AI 整理任务没有创建，请稍后重试。",
      code: jobError.code,
    }, jobError.code === "P0003" ? 429 : 502);
  }
  if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
    return json(request, env, { message: "AI 整理任务没有创建，请稍后重试。" }, 502);
  }
  try {
    await env.AI_JOBS_QUEUE.send({ jobId });
  } catch {
    return json(request, env, {
      message: "AI 整理任务暂时未进入队列，请重试或手动填写。",
      code: "AI_QUEUE_UNAVAILABLE",
    }, 503);
  }
  return json(request, env, { jobId, revision, status: (job as { status?: unknown }).status }, 202);
}

export async function handleUnderstandingJob(request: Request, env: WorkerEnv) {
  if (request.method !== "POST") return json(request, env, { message: "Method not allowed" }, 405);
  const authorization = bearerToken(request);
  if (!authorization) return json(request, env, { message: "请先登录。" }, 401);
  const config = publicSupabaseConfig(env);
  if (!config || !env.SUPABASE_SECRET_KEY || !env.OPENAI_API_KEY || !env.AI_JOBS_QUEUE) {
    return json(request, env, {
      message: "共同理解服务尚未配置。双方已确认的表达仍会保留。",
      code: "AI_SERVICE_NOT_CONFIGURED",
    }, 503);
  }
  let body: unknown;
  try {
    body = await readJson(request, 4 * 1024);
  } catch (error) {
    return json(request, env, { message: "请求格式无效。" }, error instanceof RangeError ? 413 : 400);
  }
  const roomId = body && typeof body === "object" && !Array.isArray(body) &&
    Object.keys(body).length === 1 && "roomId" in body
    ? (body as { roomId?: unknown }).roomId
    : null;
  if (typeof roomId !== "string" || !uuidPattern.test(roomId)) {
    return json(request, env, { message: "操作参数无效。" }, 400);
  }
  const supabase = userClient(config, authorization);
  if (!await verifiedUserId(supabase, authorization)) {
    return json(request, env, { message: "登录已失效。" }, 401);
  }
  const { data: job, error } = await supabase.rpc("request_consensus_job_v2", { p_room_id: roomId });
  if (error) {
    return json(request, env, {
      message: safeDatabaseMessages[error.code] ?? "共同理解任务没有创建，请稍后重试。",
      code: error.code,
    }, 400);
  }
  const status = job && typeof job === "object" ? (job as { status?: unknown }).status : null;
  const jobId = job && typeof job === "object" ? (job as { jobId?: unknown }).jobId : null;
  if (status === "SUCCEEDED" && typeof jobId !== "string") {
    return json(request, env, { status: "SUCCEEDED" }, 200);
  }
  if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
    return json(request, env, { message: "共同理解任务没有创建，请稍后重试。" }, 502);
  }
  if (["FAILED_FINAL", "CANCELED", "STALE"].includes(String(status))) {
    return json(request, env, {
      message: "当前表达没有生成可展示的共同理解，请修改表达后再试。",
      code: "UNDERSTANDING_REQUIRES_REVISION",
      status,
    }, 409);
  }
  try {
    await env.AI_JOBS_QUEUE.send({ jobId });
  } catch {
    return json(request, env, {
      message: "任务暂时没有进入队列，双方表达已安全保留。",
      code: "AI_QUEUE_UNAVAILABLE",
    }, 503);
  }
  return json(request, env, { jobId, status }, 202);
}

export async function handleMiniappApi(request: Request, env: WorkerEnv) {
  if (request.method !== "POST") return json(request, env, { message: "Method not allowed" }, 405);
  const authorization = bearerToken(request);
  if (!authorization) return json(request, env, { message: "请先登录。" }, 401);
  const supabaseConfig = publicSupabaseConfig(env);
  if (!supabaseConfig) {
    return json(request, env, {
      message: "服务暂时不可用，请稍后再试。",
      code: "SERVICE_NOT_CONFIGURED",
    }, 503);
  }

  let payload: unknown;
  try {
    payload = await readJson(request);
  } catch (error) {
    const status = error instanceof RangeError ? 413 : 400;
    return json(request, env, { message: "请求格式无效。" }, status);
  }
  if (!payload || typeof payload !== "object") {
    return json(request, env, { message: "请求格式无效。" }, 400);
  }
  const { method, args } = payload as { method?: unknown; args?: unknown };
  if (typeof method !== "string" || !isAllowedRpcMethod(method)) {
    return json(request, env, { message: "不支持的操作。" }, 400);
  }
  const validatedArgs = validateRpcArgs(method, args);
  if (!validatedArgs) return json(request, env, { message: "操作参数无效。" }, 400);

  const supabase = userClient(supabaseConfig, authorization);
  if (!await verifiedUserId(supabase, authorization)) {
    return json(request, env, { message: "登录已失效。" }, 401);
  }

  const { data, error } = await supabase.rpc(method, validatedArgs);
  if (error) {
    const message = safeDatabaseMessages[error.code] ?? "操作没有完成，请稍后重试。";
    return json(request, env, { message, code: error.code }, 400);
  }
  return json(request, env, data);
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (item) => item.toString(16).padStart(2, "0")).join("");
}

function authPayload(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string };
}) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    userId: session.user.id,
  };
}

export async function handleWechatLogin(request: Request, env: WorkerEnv) {
  if (request.method !== "POST") return json(request, env, { message: "Method not allowed" }, 405);
  const configured = requireEnv(env, [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "WECHAT_APP_ID",
    "WECHAT_APP_SECRET",
  ] as const);
  const supabaseConfig = publicSupabaseConfig(env);
  if (!configured || !supabaseConfig) {
    return json(request, env, { message: "微信登录尚未配置。" }, 503);
  }

  let payload: unknown;
  try {
    payload = await readJson(request, 16 * 1024);
  } catch (error) {
    const status = error instanceof RangeError ? 413 : 400;
    return json(request, env, { message: "请求格式无效。" }, status);
  }
  if (!payload || typeof payload !== "object") {
    return json(request, env, { message: "请求格式无效。" }, 400);
  }
  const input = payload as { code?: unknown; refreshToken?: unknown };
  const code = typeof input.code === "string" ? input.code.trim() : "";
  const refreshToken = typeof input.refreshToken === "string" ? input.refreshToken.trim() : "";
  const client = createClient(supabaseConfig.url, supabaseConfig.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (refreshToken) {
    const { data: refreshed, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !refreshed.session || !refreshed.user) {
      return json(request, env, { message: "登录已失效，请重新进入小程序。" }, 401);
    }
    return json(request, env, authPayload({ ...refreshed.session, user: refreshed.user }));
  }
  if (!code || code.length > 128) {
    return json(request, env, { message: "缺少微信登录凭证。" }, 400);
  }

  let authResponse: Response;
  try {
    const params = new URLSearchParams({
      appid: configured.WECHAT_APP_ID,
      secret: configured.WECHAT_APP_SECRET,
      js_code: code,
      grant_type: "authorization_code",
    });
    authResponse = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return json(request, env, { message: "微信身份服务暂时不可用。" }, 502);
  }
  const identity = await authResponse.json().catch(() => ({})) as {
    openid?: string;
    unionid?: string;
    errcode?: number;
  };
  if (!authResponse.ok || !identity.openid || identity.errcode) {
    return json(request, env, { message: "微信身份校验失败，请重新进入小程序。" }, 401);
  }

  const admin = adminClient(configured);
  const { data: knownUser, error: lookupError } = await admin.rpc(
    "internal_get_wechat_user",
    { p_openid: identity.openid },
  );
  if (lookupError) return json(request, env, { message: "微信身份映射读取失败。" }, 500);

  let userId = typeof knownUser === "string" ? knownUser : null;
  let email = "";
  if (userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user?.email) return json(request, env, { message: "用户会话创建失败。" }, 500);
    email = data.user.email;
  } else {
    email = `wx_${(await digest(identity.openid)).slice(0, 32)}@users.shuokai.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { provider: "wechat-mini-program" },
    });
    if (error || !data.user) {
      const { data: racedUser } = await admin.rpc("internal_get_wechat_user", {
        p_openid: identity.openid,
      });
      if (typeof racedUser !== "string") return json(request, env, { message: "用户创建失败。" }, 500);
      userId = racedUser;
      const { data: racedAccount, error: racedAccountError } = await admin.auth.admin.getUserById(userId);
      if (racedAccountError || !racedAccount.user?.email) {
        return json(request, env, { message: "用户会话创建失败。" }, 500);
      }
      email = racedAccount.user.email;
    } else {
      const createdUserId = data.user.id;
      const { data: boundUser, error: bindError } = await admin.rpc("internal_bind_wechat_user", {
        p_openid: identity.openid,
        p_unionid: identity.unionid ?? "",
        p_user_id: createdUserId,
      });
      if (bindError || typeof boundUser !== "string") {
        await admin.auth.admin.deleteUser(createdUserId);
        return json(request, env, { message: "微信身份绑定失败。" }, 500);
      }
      userId = boundUser;
      if (userId !== createdUserId) {
        await admin.auth.admin.deleteUser(createdUserId);
        const { data: boundAccount, error: boundAccountError } = await admin.auth.admin.getUserById(userId);
        if (boundAccountError || !boundAccount.user?.email) {
          return json(request, env, { message: "用户会话创建失败。" }, 500);
        }
        email = boundAccount.user.email;
      }
    }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return json(request, env, { message: "登录令牌创建失败。" }, 500);

  const { data: verified, error: verifyError } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError || !verified.session || !verified.user) {
    return json(request, env, { message: "登录会话签发失败。" }, 500);
  }
  return json(request, env, authPayload({ ...verified.session, user: verified.user }));
}

const supportedExtensions = new Set(["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]);
const supportedTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/mp4",
  "application/octet-stream",
]);

export function isSupportedAudio(file: File) {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const mediaType = file.type.toLowerCase().split(";", 1)[0].trim();
  return supportedExtensions.has(extension) && (!mediaType || supportedTypes.has(mediaType));
}

export async function handleTranscribe(request: Request, env: WorkerEnv) {
  if (request.method !== "POST") return json(request, env, { message: "Method not allowed" }, 405);
  const authorization = bearerToken(request);
  if (!authorization) return json(request, env, { message: "请先登录。" }, 401);
  const configured = requireEnv(env, [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "OPENAI_API_KEY",
  ] as const);
  const supabaseConfig = publicSupabaseConfig(env);
  if (!configured || !supabaseConfig) {
    return json(request, env, { message: "语音服务尚未配置。" }, 503);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 22 * 1024 * 1024) {
    return json(request, env, { message: "录音不能超过 20MB。" }, 413);
  }

  const supabase = userClient(supabaseConfig, authorization);
  const userId = await verifiedUserId(supabase, authorization);
  if (!userId) return json(request, env, { message: "登录已失效。" }, 401);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return json(request, env, { message: "没有收到录音文件。" }, 400);
  }
  if (file.size > 20 * 1024 * 1024) {
    return json(request, env, { message: "录音不能超过 20MB。" }, 413);
  }
  if (!isSupportedAudio(file)) {
    return json(request, env, { message: "当前录音格式不受支持，请改用文字输入。" }, 415);
  }

  const admin = adminClient(configured);
  const { data: allowed, error: quotaError } = await admin.rpc(
    "internal_reserve_transcription",
    { p_user_id: userId },
  );
  if (quotaError) return json(request, env, { message: "暂时无法确认语音额度，请稍后重试。" }, 503);
  if (!allowed) return json(request, env, { message: "本小时转写次数已用完，请稍后再试。" }, 429);

  const openAIForm = new FormData();
  openAIForm.append("file", file, file.name || "recording.mp3");
  openAIForm.append("model", "gpt-4o-mini-transcribe");
  openAIForm.append("language", "zh");

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${configured.OPENAI_API_KEY}` },
      body: openAIForm,
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    return json(request, env, { message: "录音转写暂时不可用，请改用文字输入。" }, 502);
  }
  const result = await response.json().catch(() => ({})) as { text?: string };
  if (!response.ok || !result.text) {
    return json(request, env, { message: "录音转写暂时不可用，请改用文字输入。" }, 502);
  }
  return json(request, env, { text: result.text });
}
