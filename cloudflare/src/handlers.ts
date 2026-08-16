import { createClient } from "@supabase/supabase-js";
import {
  bearerToken,
  errorJson,
  json,
  publicSupabaseConfig,
  readJson,
  requireEnv,
  type WorkerEnv,
} from "./http.ts";
import { isAllowedRpcMethod, validateRpcArgs } from "./rpc-validation.ts";
import { isSupportedExpressionMode } from "./expression-ai.ts";
import { transcribeAudio } from "./cloudflare-ai.ts";
import {
  generateDiscoveryQuestion,
  type DiscoveryMemoryContext,
  type DiscoveryResult,
  type DiscoveryTurn,
} from "./discovery-ai.ts";

export const safeDatabaseMessages: Record<string, string> = {
  "40001": "房间刚刚发生了变化，请刷新后重试。",
  "42501": "你没有执行这个操作的权限。",
  P0001: "提交的内容不符合当前操作要求。",
  P0002: "沟通房间不存在或已经失效。",
  P0003: "AI 整理请求过于频繁，请稍后再试。",
  P0C02: "邀请方没有可确认的关系背景。请选择填写自己的版本或暂不回答。",
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

const emptyDiscoveryContextVersion = {
  profileRevision: 0,
  participantRevision: 0,
  sharedRevision: 0,
  consentRevision: 0,
  seenSharedRevision: 0,
};

function discoveryContextVersionObject(value: unknown) {
  if (!value || typeof value !== "object" || !("onboarding" in value)) return { ...emptyDiscoveryContextVersion };
  const onboarding = (value as { onboarding?: unknown }).onboarding;
  if (!onboarding || typeof onboarding !== "object" || !("version" in onboarding)) return { ...emptyDiscoveryContextVersion };
  const version = (onboarding as { version?: unknown }).version;
  if (!version || typeof version !== "object") return { ...emptyDiscoveryContextVersion };
  const item = version as Record<string, unknown>;
  return Object.fromEntries(Object.keys(emptyDiscoveryContextVersion).map((key) => [
    key,
    typeof item[key] === "number" && Number.isSafeInteger(item[key]) && Number(item[key]) >= 0 ? item[key] : 0,
  ])) as typeof emptyDiscoveryContextVersion;
}

function discoveryContextVersion(value: unknown) {
  return Object.values(discoveryContextVersionObject(value)).join(":");
}

function boundedMemoryItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return typeof record.kind === "string" && record.kind.length <= 40 &&
      typeof record.content === "string" && record.content.length <= 600
      ? [{ kind: record.kind, content: record.content }]
      : [];
  });
}

function boundedStringRecord(value: unknown, allowed: readonly string[], maxLength: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    allowed.includes(key) && typeof item === "string" && item.length <= maxLength ? [[key, item]] : []));
}

function parseDiscoveryMemoryContext(value: unknown): DiscoveryMemoryContext {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const onboarding = record.onboarding && typeof record.onboarding === "object" && !Array.isArray(record.onboarding)
    ? record.onboarding as Record<string, unknown>
    : null;
  return {
    personal: boundedMemoryItems(record.personal),
    relationship: boundedMemoryItems(record.relationship),
    ...(onboarding ? { onboarding: {
      version: discoveryContextVersionObject(value),
      profile: boundedStringRecord(onboarding.profile, ["responseLength", "language"], 30),
      myContext: boundedStringRecord(onboarding.myContext, [
        "communicationPace", "responsePreference", "planningStyle", "relationshipState",
        "observedDifference", "culturalContext",
      ], 300),
      sharedContext: boundedStringRecord(onboarding.sharedContext, [
        "source", "relationshipType", "durationRange", "interactionMode",
      ], 40),
    } } : {}),
  };
}

export type ClarificationDependencies = {
  userClient: typeof userClient;
  adminClient: typeof adminClient;
  generateDiscoveryQuestion: typeof generateDiscoveryQuestion;
};

const clarificationDependencies: ClarificationDependencies = {
  userClient,
  adminClient,
  generateDiscoveryQuestion,
};

export function isValidDiscoveryTurns(value: unknown): value is DiscoveryTurn[] {
  return Array.isArray(value) && value.every((turn) =>
    turn && typeof turn === "object" && !Array.isArray(turn) &&
    Object.keys(turn).length === 2 &&
    typeof (turn as DiscoveryTurn).question === "string" &&
    Boolean((turn as DiscoveryTurn).question.trim()) &&
    (turn as DiscoveryTurn).question.length <= 500 &&
    typeof (turn as DiscoveryTurn).answer === "string" &&
    Boolean((turn as DiscoveryTurn).answer.trim()) &&
    (turn as DiscoveryTurn).answer.length <= 1200
  );
}

function sameDiscoveryTurns(left: unknown, right: DiscoveryTurn[]) {
  return isValidDiscoveryTurns(left) && JSON.stringify(left) === JSON.stringify(right);
}

function recoveredClarificationPayload(
  value: unknown,
  expectedRevision: number,
  sourceText: string,
  turns: DiscoveryTurn[],
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const conversation = value as Record<string, unknown>;
  if (typeof conversation.revision !== "number" ||
    !Number.isSafeInteger(conversation.revision) ||
    conversation.revision <= expectedRevision ||
    conversation.sourceText !== sourceText ||
    !sameDiscoveryTurns(conversation.turns, turns) ||
    !conversation.understanding || typeof conversation.understanding !== "object" ||
    Array.isArray(conversation.understanding) ||
    typeof conversation.ready !== "boolean" ||
    typeof conversation.safetyDisposition !== "string" ||
    typeof conversation.safetyMessage !== "string") return null;
  const understanding = conversation.understanding as Record<string, unknown>;
  return {
    ...understanding,
    schemaVersion: understanding.schemaVersion,
    ready: conversation.ready,
    safetyDisposition: conversation.safetyDisposition,
    safetyMessage: conversation.safetyMessage,
    conversationSummary: typeof conversation.summary === "string" ? conversation.summary : "",
    revision: conversation.revision,
    memoryProposals: Array.isArray(conversation.memoryProposals) ? conversation.memoryProposals : [],
  };
}

export async function handleExpressionClarification(
  request: Request,
  env: WorkerEnv,
  dependencies: ClarificationDependencies = clarificationDependencies,
) {
  if (request.method !== "POST") {
    return errorJson(request, env, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const authorization = bearerToken(request);
  if (!authorization) return errorJson(request, env, "AUTH_REQUIRED", "请先登录。", 401);
  const config = publicSupabaseConfig(env);
  if (!config || !env.SUPABASE_SECRET_KEY || !env.AI) {
    return errorJson(request, env, "AI_SERVICE_NOT_CONFIGURED", "AI 私人对话尚未配置。", 503);
  }
  let body: unknown;
  try {
    // Bound total request size independently of how many schema-driven follow-ups were needed.
    body = await readJson(request, 192 * 1024);
  } catch (error) {
    return error instanceof RangeError
      ? errorJson(request, env, "PAYLOAD_TOO_LARGE", "请求格式无效。", 413)
      : errorJson(request, env, "INVALID_REQUEST", "请求格式无效。", 400);
  }
  const input = body as {
    roomId?: unknown;
    expectedRevision?: unknown;
    sourceText?: unknown;
    turns?: unknown;
  } | null;
  if (!input || typeof input.roomId !== "string" || !uuidPattern.test(input.roomId) ||
    typeof input.expectedRevision !== "number" || !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    typeof input.sourceText !== "string" || !input.sourceText.trim() || input.sourceText.length > 12000 ||
    !isValidDiscoveryTurns(input.turns)) {
    return errorJson(request, env, "INVALID_ARGUMENTS", "操作参数无效。", 400);
  }
  const supabase = dependencies.userClient(config, authorization);
  const userId = await verifiedUserId(supabase, authorization);
  if (!userId) {
    return errorJson(request, env, "AUTH_SESSION_EXPIRED", "登录已失效。", 401);
  }
  const { error: membershipError } = await supabase.rpc("get_expression_workspace_v2", {
    p_room_id: input.roomId,
  });
  if (membershipError) {
    return errorJson(
      request,
      env,
      "DATABASE_REQUEST_FAILED",
      safeDatabaseMessages[membershipError.code] ?? "暂时无法确认沟通房间。",
      400,
    );
  }
  // A mobile client can give up waiting while the Worker still finishes and
  // durably saves the answer. Make the next tap idempotent: return that exact
  // saved turn instead of spending another model call and then conflicting on
  // the optimistic revision.
  const { data: existingConversation } = await supabase.rpc("get_ai_private_conversation_v1", {
    p_room_id: input.roomId,
  });
  const recovered = recoveredClarificationPayload(
    existingConversation,
    input.expectedRevision,
    input.sourceText.trim(),
    input.turns,
  );
  if (recovered) return json(request, env, recovered);
  if (existingConversation && typeof existingConversation === "object" &&
    typeof (existingConversation as { revision?: unknown }).revision === "number" &&
    Number((existingConversation as { revision: number }).revision) > input.expectedRevision) {
    return errorJson(
      request,
      env,
      "PRIVATE_CONVERSATION_CONFLICT",
      "这段私人对话刚刚在别处更新，请重新打开后继续。",
      409,
    );
  }
  try {
    const { data: memoryContext, error: memoryError } = await supabase.rpc("get_ai_memory_context_v1", {
      p_room_id: input.roomId,
    });
    if (memoryError) {
      return errorJson(
        request,
        env,
        "DATABASE_REQUEST_FAILED",
        "暂时无法读取这段私人对话的 AI 上下文，请重试或按现有内容继续整理。",
        502,
      );
    }
    const boundedMemoryContext = parseDiscoveryMemoryContext(memoryContext);
    const contextVersionObject = discoveryContextVersionObject(boundedMemoryContext);
    const contextVersion = Object.values(contextVersionObject).join(":");
    const generated = await dependencies.generateDiscoveryQuestion(env, {
      sourceText: input.sourceText.trim(),
      turns: input.turns,
      memoryContext: boundedMemoryContext,
    });
    const discoveryResult = generated.result as DiscoveryResult;
    const { data: latestContext, error: latestContextError } = await supabase.rpc("get_ai_memory_context_v1", {
      p_room_id: input.roomId,
    });
    if (latestContextError) {
      return errorJson(
        request,
        env,
        "DATABASE_REQUEST_FAILED",
        "暂时无法确认 AI 上下文是否有更新，请重试或按现有内容继续整理。",
        502,
      );
    }
    if (discoveryContextVersion(latestContext) !== contextVersion) {
      return errorJson(
        request,
        env,
        "CONTEXT_STALE",
        "你刚刚更新了 AI 可以参考的资料，请用最新设置重新继续。",
        409,
      );
    }
    const admin = dependencies.adminClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY });
    const { data: saved, error: saveError } = await admin.rpc("internal_save_ai_private_conversation_v2", {
      p_room_id: input.roomId,
      p_owner_user_id: userId,
      p_expected_revision: input.expectedRevision,
      p_expected_context_version: contextVersionObject,
      p_source_text: input.sourceText.trim(),
      p_turns: input.turns,
      p_result: {
        ready: discoveryResult.ready,
        question: discoveryResult.nextQuestion.text,
        understanding: {
          schemaVersion: discoveryResult.schemaVersion,
          coverage: discoveryResult.coverage,
          latestAnswerUpdate: discoveryResult.latestAnswerUpdate,
          nextQuestion: discoveryResult.nextQuestion,
        },
        safetyDisposition: discoveryResult.safetyDisposition,
        safetyMessage: discoveryResult.safetyMessage,
        conversationSummary: discoveryResult.conversationSummary,
        memoryCandidates: discoveryResult.memoryCandidates,
      },
    });
    if (saveError) {
      if (saveError.code === "P0C01") {
        return errorJson(
          request,
          env,
          "CONTEXT_STALE",
          "你刚刚更新了 AI 可以参考的资料，请用最新设置重新继续。",
          409,
        );
      }
      const conflict = saveError.code === "40001";
      return errorJson(
        request,
        env,
        conflict ? "PRIVATE_CONVERSATION_CONFLICT" : "PRIVATE_CONVERSATION_SAVE_FAILED",
        conflict ? "这段私人对话刚刚在别处更新，请重新打开后继续。" : "AI 已理解这句话，但私人对话没有保存，请重试。",
        conflict ? 409 : 502,
      );
    }
    const { data: restored, error: restoreError } = await supabase.rpc("get_ai_private_conversation_v1", {
      p_room_id: input.roomId,
    });
    if (restoreError || !saved || typeof saved !== "object") {
      return errorJson(request, env, "PRIVATE_CONVERSATION_SAVE_FAILED", "私人对话已经处理，但暂时无法确认保存状态，请重新读取。", 502);
    }
    const savedRevision = (saved as { revision?: unknown }).revision;
    const memoryProposals = restored && typeof restored === "object"
      ? (restored as { memoryProposals?: unknown }).memoryProposals
      : [];
    return json(request, env, {
      ...discoveryResult,
      revision: savedRevision,
      memoryProposals: Array.isArray(memoryProposals) ? memoryProposals : [],
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : "";
    if (cause === "CLOUDFLARE_AI_INVALID_OUTPUT") {
      return errorJson(
        request,
        env,
        "AI_RESPONSE_INVALID",
        "AI 这次回复没有通过安全校验，请重试或按现有内容继续整理。",
        502,
      );
    }
    if (cause === "CLOUDFLARE_AI_QUOTA_EXHAUSTED") {
      return errorJson(
        request,
        env,
        "AI_RATE_LIMITED",
        "AI 今日可用额度已经用完，请按现有内容继续整理。",
        429,
      );
    }
    return errorJson(
      request,
      env,
      "AI_CLARIFICATION_FAILED",
      "AI 服务这次没有完成处理，请重试或按现有内容继续整理。",
      502,
    );
  }
}

export async function handleExpressionJob(request: Request, env: WorkerEnv, correlationId: string) {
  if (request.method !== "POST") {
    return errorJson(request, env, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const authorization = bearerToken(request);
  if (!authorization) return errorJson(request, env, "AUTH_REQUIRED", "请先登录。", 401);
  const config = publicSupabaseConfig(env);
  if (!config || !env.SUPABASE_SECRET_KEY || !env.AI || !env.AI_JOBS_QUEUE) {
    return errorJson(
      request,
      env,
      "AI_SERVICE_NOT_CONFIGURED",
      "AI 整理服务尚未配置，请先手动填写。",
      503,
    );
  }
  let body: unknown;
  try {
    body = await readJson(request, 32 * 1024);
  } catch (error) {
    return error instanceof RangeError
      ? errorJson(request, env, "PAYLOAD_TOO_LARGE", "请求格式无效。", 413)
      : errorJson(request, env, "INVALID_REQUEST", "请求格式无效。", 400);
  }
  if (!body || typeof body !== "object") {
    return errorJson(request, env, "INVALID_REQUEST", "请求格式无效。", 400);
  }
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
    return errorJson(request, env, "INVALID_ARGUMENTS", "操作参数无效。", 400);
  }

  const supabase = userClient(config, authorization);
  if (!await verifiedUserId(supabase, authorization)) {
    return errorJson(request, env, "AUTH_SESSION_EXPIRED", "登录已失效。", 401);
  }
  const normalizedSource = input.sourceText.trim();
  const { data: saved, error: saveError } = await supabase.rpc("save_expression_workspace_v2", {
    p_room_id: input.roomId,
    p_expected_revision: input.expectedRevision,
    p_source_text: normalizedSource,
    p_selected_mode: input.selectedMode,
    p_manual_payload: input.manualPayload ?? {},
  });
  if (saveError) {
    return errorJson(
      request,
      env,
      saveError.code === "40001" ? "WORKSPACE_CONFLICT" : "WORKSPACE_SAVE_FAILED",
      safeDatabaseMessages[saveError.code] ?? "表达草稿没有保存，请稍后重试。",
      saveError.code === "40001" ? 409 : 400,
    );
  }
  const revision = saved && typeof saved === "object"
    ? (saved as { revision?: unknown }).revision
    : null;
  if (typeof revision !== "number") {
    return errorJson(
      request,
      env,
      "DATA_SERVICE_INVALID_RESPONSE",
      "数据服务返回了无效结果。",
      502,
    );
  }
  const { data: job, error: jobError } = await supabase.rpc("request_understanding_job_v2", {
    p_room_id: input.roomId,
    p_expected_revision: revision,
  });
  const jobId = job && typeof job === "object" ? (job as { jobId?: unknown }).jobId : null;
  if (jobError) {
    const rateLimited = jobError.code === "P0003";
    return errorJson(
      request,
      env,
      rateLimited ? "AI_RATE_LIMITED" : "AI_JOB_CREATE_FAILED",
      safeDatabaseMessages[jobError.code] ?? "AI 整理任务没有创建，请稍后重试。",
      rateLimited ? 429 : 502,
    );
  }
  if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
    return errorJson(
      request,
      env,
      "AI_JOB_CREATE_FAILED",
      "AI 整理任务没有创建，请稍后重试。",
      502,
    );
  }
  try {
    await env.AI_JOBS_QUEUE.send({ jobId, correlationId });
  } catch {
    return errorJson(
      request,
      env,
      "AI_QUEUE_UNAVAILABLE",
      "AI 整理任务暂时未进入队列，请重试或手动填写。",
      503,
    );
  }
  return json(request, env, { jobId, revision, status: (job as { status?: unknown }).status }, 202);
}

export async function handleUnderstandingJob(request: Request, env: WorkerEnv, correlationId: string) {
  if (request.method !== "POST") {
    return errorJson(request, env, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const authorization = bearerToken(request);
  if (!authorization) return errorJson(request, env, "AUTH_REQUIRED", "请先登录。", 401);
  const config = publicSupabaseConfig(env);
  if (!config || !env.SUPABASE_SECRET_KEY || !env.AI || !env.AI_JOBS_QUEUE) {
    return errorJson(
      request,
      env,
      "AI_SERVICE_NOT_CONFIGURED",
      "共同理解服务尚未配置。双方已确认的表达仍会保留。",
      503,
    );
  }
  let body: unknown;
  try {
    body = await readJson(request, 4 * 1024);
  } catch (error) {
    return error instanceof RangeError
      ? errorJson(request, env, "PAYLOAD_TOO_LARGE", "请求格式无效。", 413)
      : errorJson(request, env, "INVALID_REQUEST", "请求格式无效。", 400);
  }
  const roomId = body && typeof body === "object" && !Array.isArray(body) &&
    Object.keys(body).length === 1 && "roomId" in body
    ? (body as { roomId?: unknown }).roomId
    : null;
  if (typeof roomId !== "string" || !uuidPattern.test(roomId)) {
    return errorJson(request, env, "INVALID_ARGUMENTS", "操作参数无效。", 400);
  }
  const supabase = userClient(config, authorization);
  if (!await verifiedUserId(supabase, authorization)) {
    return errorJson(request, env, "AUTH_SESSION_EXPIRED", "登录已失效。", 401);
  }
  const { data: job, error } = await supabase.rpc("request_consensus_job_v2", { p_room_id: roomId });
  if (error) {
    return errorJson(
      request,
      env,
      "UNDERSTANDING_JOB_CREATE_FAILED",
      safeDatabaseMessages[error.code] ?? "共同理解任务没有创建，请稍后重试。",
      400,
    );
  }
  const status = job && typeof job === "object" ? (job as { status?: unknown }).status : null;
  const jobId = job && typeof job === "object" ? (job as { jobId?: unknown }).jobId : null;
  if (status === "SUCCEEDED" && typeof jobId !== "string") {
    return json(request, env, { status: "SUCCEEDED" }, 200);
  }
  if (typeof jobId !== "string" || !uuidPattern.test(jobId)) {
    return errorJson(
      request,
      env,
      "UNDERSTANDING_JOB_CREATE_FAILED",
      "共同理解任务没有创建，请稍后重试。",
      502,
    );
  }
  if (["FAILED_FINAL", "CANCELED", "STALE"].includes(String(status))) {
    return errorJson(
      request,
      env,
      "UNDERSTANDING_REQUIRES_REVISION",
      "当前表达没有生成可展示的共同理解，请修改表达后再试。",
      409,
      { status },
    );
  }
  try {
    await env.AI_JOBS_QUEUE.send({ jobId, correlationId });
  } catch {
    return errorJson(
      request,
      env,
      "AI_QUEUE_UNAVAILABLE",
      "任务暂时没有进入队列，双方表达已安全保留。",
      503,
    );
  }
  return json(request, env, { jobId, status }, 202);
}

export async function handleMiniappApi(request: Request, env: WorkerEnv) {
  if (request.method !== "POST") {
    return errorJson(request, env, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const authorization = bearerToken(request);
  if (!authorization) return errorJson(request, env, "AUTH_REQUIRED", "请先登录。", 401);
  const supabaseConfig = publicSupabaseConfig(env);
  if (!supabaseConfig) {
    return errorJson(
      request,
      env,
      "SERVICE_NOT_CONFIGURED",
      "服务暂时不可用，请稍后再试。",
      503,
    );
  }

  let payload: unknown;
  try {
    payload = await readJson(request);
  } catch (error) {
    return error instanceof RangeError
      ? errorJson(request, env, "PAYLOAD_TOO_LARGE", "请求格式无效。", 413)
      : errorJson(request, env, "INVALID_REQUEST", "请求格式无效。", 400);
  }
  if (!payload || typeof payload !== "object") {
    return errorJson(request, env, "INVALID_REQUEST", "请求格式无效。", 400);
  }
  const { method, args } = payload as { method?: unknown; args?: unknown };
  if (typeof method !== "string" || !isAllowedRpcMethod(method)) {
    return errorJson(request, env, "UNSUPPORTED_OPERATION", "不支持的操作。", 400);
  }
  const validatedArgs = validateRpcArgs(method, args);
  if (!validatedArgs) {
    const message = method === "save_room_relationship_context_v1" ||
      method === "respond_room_relationship_context_v1"
      ? "关系背景没有保存。请重新打开这间房，确认当前选择后再试；本机草稿仍会保留。"
      : "操作参数无效。";
    return errorJson(request, env, "INVALID_ARGUMENTS", message, 400);
  }

  const supabase = userClient(supabaseConfig, authorization);
  if (!await verifiedUserId(supabase, authorization)) {
    return errorJson(request, env, "AUTH_SESSION_EXPIRED", "登录已失效。", 401);
  }

  const { data, error } = await supabase.rpc(method, validatedArgs);
  if (error) {
    const message = safeDatabaseMessages[error.code] ?? "操作没有完成，请稍后重试。";
    return errorJson(
      request,
      env,
      error.code === "40001" ? "WORKSPACE_CONFLICT" : "DATABASE_REQUEST_FAILED",
      message,
      error.code === "40001" ? 409 : 400,
    );
  }
  return json(request, env, data);
}

export async function handleInvitationContext(request: Request, env: WorkerEnv) {
  if (request.method !== "POST") {
    return errorJson(request, env, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const authorization = bearerToken(request);
  if (!authorization) return errorJson(request, env, "AUTH_REQUIRED", "请先登录。", 401);
  const config = publicSupabaseConfig(env);
  if (!config) {
    return errorJson(request, env, "SERVICE_NOT_CONFIGURED", "服务暂时不可用，请稍后再试。", 503);
  }
  let body: unknown;
  try {
    body = await readJson(request, 4 * 1024);
  } catch (error) {
    return error instanceof RangeError
      ? errorJson(request, env, "PAYLOAD_TOO_LARGE", "请求格式无效。", 413)
      : errorJson(request, env, "INVALID_REQUEST", "请求格式无效。", 400);
  }
  const roomId = body && typeof body === "object" && !Array.isArray(body) &&
    Object.keys(body).length === 1 && "roomId" in body
    ? (body as { roomId?: unknown }).roomId
    : null;
  if (typeof roomId !== "string" || !uuidPattern.test(roomId)) {
    return errorJson(request, env, "INVALID_ARGUMENTS", "操作参数无效。", 400);
  }

  const supabase = userClient(config, authorization);
  if (!await verifiedUserId(supabase, authorization)) {
    return errorJson(request, env, "AUTH_SESSION_EXPIRED", "登录已失效。", 401);
  }
  const { data: context, error: contextError } = await supabase.rpc("get_invitation_context_v3", {
    p_room_id: roomId,
  });
  if (contextError || !context || typeof context !== "object") {
    return errorJson(
      request,
      env,
      "INVITATION_CONTEXT_UNAVAILABLE",
      safeDatabaseMessages[contextError?.code ?? ""] ?? "暂时无法读取这次邀请，请稍后重试。",
      contextError?.code === "42501" ? 403 : 502,
    );
  }
  return json(request, env, context);
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
  if (request.method !== "POST") {
    return errorJson(request, env, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const configured = requireEnv(env, [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "WECHAT_APP_ID",
    "WECHAT_APP_SECRET",
  ] as const);
  const supabaseConfig = publicSupabaseConfig(env);
  if (!configured || !supabaseConfig) {
    return errorJson(request, env, "WECHAT_AUTH_NOT_CONFIGURED", "微信登录尚未配置。", 503);
  }

  let payload: unknown;
  try {
    payload = await readJson(request, 16 * 1024);
  } catch (error) {
    return error instanceof RangeError
      ? errorJson(request, env, "PAYLOAD_TOO_LARGE", "请求格式无效。", 413)
      : errorJson(request, env, "INVALID_REQUEST", "请求格式无效。", 400);
  }
  if (!payload || typeof payload !== "object") {
    return errorJson(request, env, "INVALID_REQUEST", "请求格式无效。", 400);
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
      return errorJson(
        request,
        env,
        "WECHAT_SESSION_EXPIRED",
        "登录已失效，请重新进入小程序。",
        401,
      );
    }
    return json(request, env, authPayload({ ...refreshed.session, user: refreshed.user }));
  }
  if (!code || code.length > 128) {
    return errorJson(request, env, "WECHAT_CODE_REQUIRED", "缺少微信登录凭证。", 400);
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
    return errorJson(
      request,
      env,
      "WECHAT_IDENTITY_UNAVAILABLE",
      "微信身份服务暂时不可用。",
      502,
    );
  }
  const identity = await authResponse.json().catch(() => ({})) as {
    openid?: string;
    unionid?: string;
    errcode?: number;
  };
  if (!authResponse.ok || !identity.openid || identity.errcode) {
    return errorJson(
      request,
      env,
      "WECHAT_IDENTITY_INVALID",
      "微信身份校验失败，请重新进入小程序。",
      401,
    );
  }

  const admin = adminClient(configured);
  const { data: knownUser, error: lookupError } = await admin.rpc(
    "internal_get_wechat_user",
    { p_openid: identity.openid },
  );
  if (lookupError) {
    return errorJson(request, env, "WECHAT_MAPPING_FAILED", "微信身份映射读取失败。", 500);
  }

  let userId = typeof knownUser === "string" ? knownUser : null;
  let email = "";
  if (userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user?.email) {
      return errorJson(request, env, "USER_SESSION_CREATE_FAILED", "用户会话创建失败。", 500);
    }
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
      if (typeof racedUser !== "string") {
        return errorJson(request, env, "USER_CREATE_FAILED", "用户创建失败。", 500);
      }
      userId = racedUser;
      const { data: racedAccount, error: racedAccountError } = await admin.auth.admin.getUserById(userId);
      if (racedAccountError || !racedAccount.user?.email) {
        return errorJson(request, env, "USER_SESSION_CREATE_FAILED", "用户会话创建失败。", 500);
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
        return errorJson(request, env, "WECHAT_BIND_FAILED", "微信身份绑定失败。", 500);
      }
      userId = boundUser;
      if (userId !== createdUserId) {
        await admin.auth.admin.deleteUser(createdUserId);
        const { data: boundAccount, error: boundAccountError } = await admin.auth.admin.getUserById(userId);
        if (boundAccountError || !boundAccount.user?.email) {
          return errorJson(request, env, "USER_SESSION_CREATE_FAILED", "用户会话创建失败。", 500);
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
  if (linkError || !tokenHash) {
    return errorJson(request, env, "LOGIN_TOKEN_CREATE_FAILED", "登录令牌创建失败。", 500);
  }

  const { data: verified, error: verifyError } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError || !verified.session || !verified.user) {
    return errorJson(request, env, "LOGIN_SESSION_ISSUE_FAILED", "登录会话签发失败。", 500);
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
  if (request.method !== "POST") {
    return errorJson(request, env, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }
  const authorization = bearerToken(request);
  if (!authorization) return errorJson(request, env, "AUTH_REQUIRED", "请先登录。", 401);
  const configured = requireEnv(env, [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
  ] as const);
  const supabaseConfig = publicSupabaseConfig(env);
  if (!configured || !supabaseConfig || !env.AI) {
    return errorJson(
      request,
      env,
      "TRANSCRIPTION_SERVICE_NOT_CONFIGURED",
      "语音服务尚未配置。",
      503,
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 22 * 1024 * 1024) {
    return errorJson(request, env, "AUDIO_TOO_LARGE", "录音不能超过 20MB。", 413);
  }

  const supabase = userClient(supabaseConfig, authorization);
  const userId = await verifiedUserId(supabase, authorization);
  if (!userId) return errorJson(request, env, "AUTH_SESSION_EXPIRED", "登录已失效。", 401);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorJson(request, env, "AUDIO_REQUIRED", "没有收到录音文件。", 400);
  }
  if (file.size > 20 * 1024 * 1024) {
    return errorJson(request, env, "AUDIO_TOO_LARGE", "录音不能超过 20MB。", 413);
  }
  if (!isSupportedAudio(file)) {
    return errorJson(
      request,
      env,
      "AUDIO_FORMAT_UNSUPPORTED",
      "当前录音格式不受支持，请改用文字输入。",
      415,
    );
  }

  const admin = adminClient(configured);
  const { data: allowed, error: quotaError } = await admin.rpc(
    "internal_reserve_transcription",
    { p_user_id: userId },
  );
  if (quotaError) {
    return errorJson(
      request,
      env,
      "TRANSCRIPTION_QUOTA_UNAVAILABLE",
      "暂时无法确认语音额度，请稍后重试。",
      503,
    );
  }
  if (!allowed) {
    return errorJson(
      request,
      env,
      "TRANSCRIPTION_RATE_LIMITED",
      "本小时转写次数已用完，请稍后再试。",
      429,
    );
  }

  try {
    return json(request, env, { text: await transcribeAudio(env, file) });
  } catch {
    return errorJson(
      request,
      env,
      "TRANSCRIPTION_FAILED",
      "录音转写暂时不可用，请改用文字输入。",
      502,
    );
  }
}
