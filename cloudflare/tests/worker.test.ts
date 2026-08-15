import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { REVIEW_MODEL, TEXT_MODEL, TRANSCRIPTION_MODEL, transcribeAudio } from "../src/cloudflare-ai.ts";
import { isSupportedAudio } from "../src/handlers.ts";
import { appErrorCodes, bearerToken, publicSupabaseConfig } from "../src/http.ts";
import { handleRequest } from "../src/index.ts";
import {
  createRequestLogContext,
  logRequestException,
  logQueueBatch,
  observeResponse,
  routeName,
} from "../src/observability.ts";
import { isAllowedRpcMethod, validateRpcArgs } from "../src/rpc-validation.ts";
import {
  invitationContextFromRecords,
  invitationTopicFromExpression,
} from "../src/invitation-context.ts";
import {
  expressionResultSchema,
  generateExpressionCandidate,
  generateSharedUnderstanding,
  reviewSharedUnderstanding,
  isExpressionResult,
  isUnderstandingResult,
  isUnderstandingReview,
  normalizeUnderstandingResult,
  parseExpressionConversationSource,
  parseQueueMessage,
  processExpressionQueue,
  understandingResultSchema,
  understandingReviewSchema,
} from "../src/expression-ai.ts";
import {
  discoveryResultSchema,
  generateDiscoveryQuestion,
  isDiscoveryResult,
} from "../src/discovery-ai.ts";

function validNvcExpressionResult(state: "ASK" | "READY" = "ASK") {
  const ask = state === "ASK";
  const question = ask ? "这次没有消息时，你最希望对方理解哪一种影响？" : "";
  return {
    mode: "NVC",
    fields: {
      observation: "周日仍未收到消息",
      feeling: "失望",
      need: "确定感",
      request: "变化时当天告诉我",
    },
    uncertainties: ask ? [question] : [],
    conversation: {
      state,
      reflection: "你等到周日仍没有收到约定的消息，这让你失望，也更需要确定感。",
      tentativeUnderstanding: ask ? "我不确定，等待本身可能比结果更让你难受。" : "",
      question,
      questionIntent: ask ? "CLARIFY_FEELING" : "NONE",
      stopReason: ask ? "NEEDS_CLARIFICATION" : "SUFFICIENT_CONTEXT",
    },
    grounding: {
      observation: { status: "USER_STATED", sources: ["SOURCE"] },
      feeling: { status: "USER_STATED", sources: ["SOURCE"] },
      need: { status: "USER_STATED", sources: ["SOURCE"] },
      request: { status: "USER_STATED", sources: ["SOURCE"] },
    },
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  };
}

function validMutualUnderstandingResult() {
  return {
    schemaVersion: 2,
    mutualUnderstanding: [{
      listenerRole: "A",
      speakerRole: "B",
      text: "A 听懂 B 想减少反复变化带来的消耗",
      sources: ["DIALOGUE.RESPONSE.B.4", "DIALOGUE.REFLECTION.A.5", "DIALOGUE.REFLECTION_CONFIRMATION.B.6"],
    }, {
      listenerRole: "B",
      speakerRole: "A",
      text: "B 听懂 A 需要在变化发生时获得确定感",
      sources: ["DIALOGUE.RESPONSE.A.1", "DIALOGUE.REFLECTION.B.2", "DIALOGUE.REFLECTION_CONFIRMATION.A.3"],
    }],
    newUnderstanding: {
      text: "双方确认，分歧不是要不要告知，而是怎样避免过早信息与迟来的不安",
      sources: ["DIALOGUE.RESPONSE.A.1", "DIALOGUE.RESPONSE.B.4"],
    },
    differences: [{
      topic: "何时告知",
      sideA: "发现可能变化时告知",
      sideB: "确认变化后告知",
      sources: ["A.request", "B.request"],
    }],
    unverifiedFacts: [],
    boundaries: [],
    nextQuestion: {
      text: "计划尚未确定时，先告知到什么程度既能让 A 安心，又不会让 B 反复更正？",
      sources: ["DIALOGUE.RESPONSE.A.1", "DIALOGUE.RESPONSE.B.4"],
    },
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  };
}

function validMutualDialogueTimeline() {
  return [
    { sequence: 1, round: 1, kind: "RESPONSE", authorRole: "A", replyToSequence: null,
      payload: { text: "变化时迟迟不知道会让我不安。", internalNote: "不得发送" } },
    { sequence: 2, round: 1, kind: "REFLECTION", authorRole: "B", replyToSequence: 1,
      payload: { text: "我听见未知的等待让你不安。" } },
    { sequence: 3, round: 1, kind: "REFLECTION_CONFIRMATION", authorRole: "A", replyToSequence: 2,
      payload: { decision: "ACCURATE", feedback: "", expressionId: "不得发送的内部 ID" } },
    { sequence: 4, round: 1, kind: "RESPONSE", authorRole: "B", replyToSequence: 3,
      payload: { text: "我担心过早告知后要反复更正。" } },
    { sequence: 5, round: 1, kind: "REFLECTION", authorRole: "A", replyToSequence: 4,
      payload: { text: "我听见你担心反复更正带来消耗。" } },
    { sequence: 6, round: 1, kind: "REFLECTION_CONFIRMATION", authorRole: "B", replyToSequence: 5,
      payload: { decision: "ACCURATE", feedback: "" } },
  ];
}

test("health endpoint identifies the Worker", async () => {
  const response = await handleRequest(new Request("https://shuokai.example/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "shuokai-api" });
  assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
});

test("structured request logs correlate failures without copying sensitive input", async () => {
  const events: Record<string, unknown>[] = [];
  const sink = {
    info: (event: Record<string, unknown>) => events.push(event),
    warn: (event: Record<string, unknown>) => events.push(event),
    error: (event: Record<string, unknown>) => events.push(event),
  };
  const request = new Request("https://shuokai.example/ai/expression?email=private@example.com", {
    method: "POST",
    headers: {
      authorization: "Bearer secret.jwt.value",
      "cf-ray": "abc123-SJC",
    },
    body: JSON.stringify({ sourceText: "这是不应进入日志的私人表达" }),
  });
  const context = createRequestLogContext(request);
  const response = await observeResponse(
    { APP_ENVIRONMENT: "test" },
    context,
    new Response(JSON.stringify({
      code: "AI_QUEUE_UNAVAILABLE",
      message: "包含 private@example.com 的内部提示",
    }), {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
    sink,
  );

  assert.equal(response.headers.get("x-request-id"), context.requestId);
  assert.deepEqual(events, [{
    schema_version: 1,
    timestamp: events[0].timestamp,
    service: "shuokai-api",
    environment: "test",
    event_name: "request_completed",
    level: "error",
    request_id: context.requestId,
    cloudflare_ray: "abc123-SJC",
    route: "ai_expression",
    method: "POST",
    status: 503,
    outcome: "server_error",
    error_code: "AI_QUEUE_UNAVAILABLE",
    duration_ms: events[0].duration_ms,
  }]);
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /private@example\.com|secret\.jwt|私人表达|sourceText|authorization/i);
  assert.equal(routeName(new Request("https://shuokai.example/private@example.com?token=secret")), "not_found");
});

test("exception logs omit error messages and stack traces", () => {
  const events: Record<string, unknown>[] = [];
  const sink = {
    info: (event: Record<string, unknown>) => events.push(event),
    warn: (event: Record<string, unknown>) => events.push(event),
    error: (event: Record<string, unknown>) => events.push(event),
  };
  const context = createRequestLogContext(new Request("https://shuokai.example/transcribe"));
  logRequestException(
    { APP_ENVIRONMENT: "test" },
    context,
    new TypeError("private@example.com secret.jwt.value 私人表达"),
    sink,
  );
  assert.equal(events[0].event_name, "request_exception");
  assert.equal(events[0].error_code, "TYPE_ERROR");
  assert.doesNotMatch(JSON.stringify(events), /private@example\.com|secret\.jwt|私人表达|stack|message/i);
});

test("queue summaries contain counts but no job identifiers or content", () => {
  const events: Record<string, unknown>[] = [];
  const sink = {
    info: (event: Record<string, unknown>) => events.push(event),
    warn: (event: Record<string, unknown>) => events.push(event),
    error: (event: Record<string, unknown>) => events.push(event),
  };
  logQueueBatch({ APP_ENVIRONMENT: "test" }, {
    batchSize: 5,
    succeeded: 3,
    retried: 1,
    discarded: 1,
    durationMs: 42,
  }, sink);
  assert.equal(events[0].event_name, "ai_queue_batch_completed");
  assert.equal(events[0].level, "warn");
  assert.equal(events[0].batch_size, 5);
  assert.equal("job_id" in events[0], false);
});

test("a logging sink failure never changes the user response", async () => {
  const request = new Request("https://shuokai.example/health");
  const context = createRequestLogContext(request);
  const throwingSink = {
    info() { throw new Error("log backend unavailable"); },
    warn() { throw new Error("log backend unavailable"); },
    error() { throw new Error("log backend unavailable"); },
  };
  const response = await observeResponse(
    { APP_ENVIRONMENT: "test" },
    context,
    new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    }),
    throwingSink,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("x-request-id"), context.requestId);
});

test("CORS only reflects same-origin or configured H5 origins", async () => {
  const allowed = await handleRequest(
    new Request("https://api.shuokai.example/health", {
      method: "OPTIONS",
      headers: { origin: "https://h5.shuokai.example" },
    }),
    { ALLOWED_ORIGINS: "https://h5.shuokai.example" },
  );
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://h5.shuokai.example");
  assert.equal(allowed.headers.get("access-control-expose-headers"), "x-request-id");

  const rejected = await handleRequest(
    new Request("https://api.shuokai.example/health", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.example" },
    }),
    { ALLOWED_ORIGINS: "https://h5.shuokai.example" },
  );
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("business API rejects unauthenticated requests before touching Supabase", async () => {
  const response = await handleRequest(
    new Request("https://shuokai.example/miniapp-api", { method: "POST" }),
    {},
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: "请先登录。", code: "AUTH_REQUIRED" });
});

test("invitation context rejects unauthenticated room reads", async () => {
  const response = await handleRequest(
    new Request("https://shuokai.example/room/invitation-context", { method: "POST" }),
    {},
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: "请先登录。", code: "AUTH_REQUIRED" });
});

test("invitation context exposes only the selected shareable topic field", () => {
  const expression = {
    mode: "NVC",
    payload: {
      observation: "  视频聊天时，提到另一个女生好看。  ",
      feeling: "不应出现在邀请摘要里的难过",
      need: "不应出现在邀请摘要里的尊重",
      request: "不应出现在邀请摘要里的要求",
    },
  };
  assert.equal(invitationTopicFromExpression(expression), "视频聊天时，提到另一个女生好看。");
  const context = invitationContextFromRecords({
    room: { goal: "让我被准确理解" },
    me: { role: "B" },
    participants: [{ role: "A", display_name: "我" }],
  }, expression);
  assert.deepEqual(context, {
    inviterName: "邀请你的人",
    topic: "视频聊天时，提到另一个女生好看。",
  });
  assert.doesNotMatch(JSON.stringify(context), /难过|尊重|要求|准确理解/);
});

test("every Worker error response exposes a controlled application code", async () => {
  const requests = [
    new Request("https://shuokai.example/unknown"),
    new Request("https://shuokai.example/miniapp-api", { method: "GET" }),
    new Request("https://shuokai.example/transcribe", { method: "POST" }),
  ];
  for (const request of requests) {
    const response = await handleRequest(request, {});
    assert.ok(response.status >= 400);
    const body = await response.json() as { code?: unknown };
    assert.equal(typeof body.code, "string");
    assert.equal(appErrorCodes.includes(body.code as typeof appErrorCodes[number]), true);
    assert.notEqual(body.code, `HTTP_${response.status}`);
  }
});

test("business API presents missing service configuration as a temporary outage", async () => {
  const response = await handleRequest(
    new Request("https://shuokai.example/miniapp-api", {
      method: "POST",
      headers: { authorization: "Bearer signed.jwt.value" },
    }),
    {},
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    message: "服务暂时不可用，请稍后再试。",
    code: "SERVICE_NOT_CONFIGURED",
  });
});

test("Bearer parsing rejects empty or ambiguous authorization values", () => {
  assert.equal(bearerToken(new Request("https://shuokai.example", {
    headers: { authorization: "Bearer signed.jwt.value" },
  })), "Bearer signed.jwt.value");
  assert.equal(bearerToken(new Request("https://shuokai.example", {
    headers: { authorization: "Bearer " },
  })), null);
  assert.equal(bearerToken(new Request("https://shuokai.example", {
    headers: { authorization: "Bearer first second" },
  })), null);
});

test("Worker accepts a modern publishable key and does not fall back to legacy keys", () => {
  assert.deepEqual(
    publicSupabaseConfig({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    }),
    { url: "https://project.supabase.co", key: "sb_publishable_test" },
  );
  assert.equal(publicSupabaseConfig({ SUPABASE_URL: "https://project.supabase.co" }), null);
});

test("RPC validation normalizes safe inputs and rejects extra fields", () => {
  assert.deepEqual(
    validateRpcArgs("join_room", { p_code: "say2026", p_display_name: " 我 " }),
    { p_code: "SAY2026", p_display_name: "我" },
  );
  assert.equal(
    validateRpcArgs("get_room_snapshot", {
      p_room_id: "11111111-1111-4111-8111-111111111111",
      unexpected: "value",
    }),
    null,
  );
});

test("room history RPC requires a bounded limit and complete cursor", () => {
  const historyRoomId = "11111111-1111-4111-8111-111111111111";
  const cursor = {
    p_limit: 12,
    p_before_updated_at: "2026-08-14T10:00:00.000Z",
    p_before_room_id: historyRoomId,
  };
  assert.deepEqual(validateRpcArgs("list_my_rooms_v2", cursor), cursor);
  assert.deepEqual(validateRpcArgs("list_my_rooms_v2", {
    p_limit: 12,
    p_before_updated_at: null,
    p_before_room_id: null,
  }), {
    p_limit: 12,
    p_before_updated_at: null,
    p_before_room_id: null,
  });
  assert.equal(validateRpcArgs("list_my_rooms_v2", { ...cursor, p_limit: 31 }), null);
  assert.equal(validateRpcArgs("list_my_rooms_v2", { ...cursor, p_before_room_id: null }), null);
});

test("RPC validation permits the agreement loop with bounded inputs", () => {
  const roomId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(
    validateRpcArgs("propose_agreement", {
      p_room_id: roomId,
      p_proposal: " 先发送一个待定信号 ",
      p_review_at: "2026-08-14T12:00:00.000Z",
    }),
    {
      p_room_id: roomId,
      p_proposal: "先发送一个待定信号",
      p_review_at: "2026-08-14T12:00:00.000Z",
    },
  );
  assert.deepEqual(validateRpcArgs("accept_agreement", { p_room_id: roomId }), {
    p_room_id: roomId,
  });
  assert.equal(
    validateRpcArgs("propose_agreement", {
      p_room_id: roomId,
      p_proposal: "尝试一个办法",
      p_review_at: "not-a-date",
    }),
    null,
  );
});

test("RPC validation bounds user-confirmed expression payloads", () => {
  const roomId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(validateRpcArgs("confirm_expression_version_v2", {
    p_room_id: roomId,
    p_expected_revision: 2,
    p_payload: { mode: "NVC", observation: "周日仍未收到消息" },
  }), {
    p_room_id: roomId,
    p_expected_revision: 2,
    p_payload: { mode: "NVC", observation: "周日仍未收到消息" },
  });
  assert.equal(validateRpcArgs("confirm_expression_version_v2", {
    p_room_id: roomId,
    p_expected_revision: -1,
    p_payload: {},
  }), null);
});

test("Worker allowlist excludes retired demo RPCs", () => {
  assert.equal(isAllowedRpcMethod("simulate_partner"), false);
  assert.equal(isAllowedRpcMethod("demo"), false);
  assert.equal(isAllowedRpcMethod("create_room"), true);
  assert.equal(isAllowedRpcMethod("get_ai_job_status_v2"), true);
});

test("AI expression endpoint fails honestly when the test queue is not configured", async () => {
  const response = await handleRequest(new Request("https://shuokai.example/ai/expression", {
    method: "POST",
    headers: { authorization: "Bearer signed.jwt.value" },
  }), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    message: "AI 整理服务尚未配置，请先手动填写。",
    code: "AI_SERVICE_NOT_CONFIGURED",
  });
});

test("AI clarification endpoint fails honestly when Workers AI is not configured", async () => {
  const response = await handleRequest(new Request("https://shuokai.example/ai/clarify", {
    method: "POST",
    headers: { authorization: "Bearer signed.jwt.value" },
  }), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    message: "AI 私人对话尚未配置。",
    code: "AI_SERVICE_NOT_CONFIGURED",
  });
});

test("shared understanding endpoint fails honestly before any database call", async () => {
  const response = await handleRequest(new Request("https://shuokai.example/ai/understanding", {
    method: "POST",
    headers: { authorization: "Bearer signed.jwt.value" },
  }), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    message: "共同理解服务尚未配置。双方已确认的表达仍会保留。",
    code: "AI_SERVICE_NOT_CONFIGURED",
  });
});

test("test deployment routes every AI endpoint through the Worker", async () => {
  const configText = await readFile(new URL("../wrangler.test.jsonc", import.meta.url), "utf8");
  assert.match(configText, /"\/ai\/expression\*"/);
  assert.match(configText, /"\/ai\/understanding\*"/);
  assert.match(configText, /"\/ai\/clarify\*"/);
  assert.match(configText, /"\/room\/invitation-context\*"/);
  assert.match(configText, /"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"/);
  assert.match(configText, /"observability"\s*:\s*\{[\s\S]*?"enabled"\s*:\s*true/);
  assert.match(configText, /"head_sampling_rate"\s*:\s*1/);
  assert.match(configText, /"APP_ENVIRONMENT"\s*:\s*"test"/);
});

test("queue messages contain only bounded job and correlation identifiers", () => {
  const jobId = "11111111-1111-4111-8111-111111111111";
  const correlationId = "22222222-2222-4222-8222-222222222222";
  assert.deepEqual(parseQueueMessage({ jobId, correlationId }), { jobId, correlationId });
  assert.deepEqual(parseQueueMessage({ jobId }), { jobId });
  assert.equal(parseQueueMessage({ jobId, sourceText: "不应进入队列" }), null);
  assert.equal(parseQueueMessage({ jobId, correlationId: "not-an-id" }), null);
  assert.equal(parseQueueMessage({ jobId: "not-an-id" }), null);
});

test("real queue handler acknowledges invalid messages and retries claim failures", async () => {
  const originalFetch = globalThis.fetch;
  const events: Record<string, unknown>[] = [];
  const sink = {
    info: (event: Record<string, unknown>) => events.push(event),
    warn: (event: Record<string, unknown>) => events.push(event),
    error: (event: Record<string, unknown>) => events.push(event),
  };
  const invalidActions: string[] = [];
  const retryActions: string[] = [];
  const correlationId = "22222222-2222-4222-8222-222222222222";
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: "PGRST500",
    message: "private database failure detail",
  }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
  try {
    await processExpressionQueue({
      messages: [
        {
          body: { jobId: "invalid", sourceText: "不得记录的私人表达" },
          ack: () => invalidActions.push("ack"),
          retry: () => invalidActions.push("retry"),
        },
        {
          body: { jobId: "11111111-1111-4111-8111-111111111111", correlationId },
          ack: () => retryActions.push("ack"),
          retry: () => retryActions.push("retry"),
        },
      ],
    }, {
      APP_ENVIRONMENT: "test",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: "server-test-key",
    }, sink);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(invalidActions, ["ack"]);
  assert.deepEqual(retryActions, ["retry"]);
  const messageEvents = events.filter((event) => event.event_name === "ai_queue_message_completed");
  assert.deepEqual(messageEvents.map((event) => event.outcome).sort(), ["discarded", "retried"]);
  assert.equal(messageEvents.some((event) => event.request_id === correlationId), true);
  assert.equal(messageEvents.some((event) => event.error_code === "INVALID_QUEUE_MESSAGE"), true);
  assert.equal(messageEvents.some((event) => event.error_code === "CLAIM_JOB_FAILED"), true);
  const batchEvent = events.find((event) => event.event_name === "ai_queue_batch_completed");
  assert.equal(batchEvent?.retried, 1);
  assert.equal(batchEvent?.discarded, 1);
  assert.doesNotMatch(
    JSON.stringify(events),
    /private database failure detail|不得记录的私人表达|server-test-key|11111111-1111/i,
  );
});

test("queue handler correlates unexpected processing failures and explicitly retries", async () => {
  const events: Record<string, unknown>[] = [];
  const actions: string[] = [];
  const correlationId = "22222222-2222-4222-8222-222222222222";
  await processExpressionQueue({
    messages: [{
      body: { jobId: "11111111-1111-4111-8111-111111111111", correlationId },
      ack: () => actions.push("ack"),
      retry: () => actions.push("retry"),
    }],
  }, {
    APP_ENVIRONMENT: "test",
    SUPABASE_URL: "not-a-valid-url",
    SUPABASE_SECRET_KEY: "server-test-key",
  }, {
    info: (event) => events.push(event),
    warn: (event) => events.push(event),
    error: (event) => events.push(event),
  });

  assert.deepEqual(actions, ["retry"]);
  const messageEvent = events.find((event) => event.event_name === "ai_queue_message_completed");
  assert.equal(messageEvent?.request_id, correlationId);
  assert.equal(messageEvent?.outcome, "retried");
  assert.equal(messageEvent?.error_code, "AI_QUEUE_HANDLER_EXCEPTION");
  assert.doesNotMatch(JSON.stringify(events), /not-a-valid-url|server-test-key|11111111-1111/i);
});

test("each AI schema is strict and path-specific", () => {
  const nvc = expressionResultSchema("NVC");
  assert.equal(nvc.additionalProperties, false);
  assert.deepEqual(nvc.properties.fields.required, ["observation", "feeling", "need", "request"]);
  assert.equal(nvc.properties.uncertainties.maxItems, 1);
  assert.deepEqual(nvc.properties.conversation.properties.state.enum, ["ASK", "READY"]);
  assert.equal((nvc.properties.conversation.properties.stopReason.enum as readonly string[])
    .includes("TURN_LIMIT"), false);
  assert.deepEqual(nvc.properties.grounding.required, ["observation", "feeling", "need", "request"]);
  const atLimit = expressionResultSchema("NVC", {
    turns: Array.from({ length: 5 }, (_, index) => ({ question: `问题${index}`, answer: `回答${index}` })),
    sourceRefs: ["SOURCE", "CURRENT_DRAFT"],
  });
  assert.deepEqual(atLimit.properties.conversation.properties.state.enum, ["READY"]);
  const dispute = expressionResultSchema("FACT_DISPUTE");
  assert.deepEqual(dispute.properties.fields.required, ["claim", "basis", "verificationRequest"]);
});

test("AI output validation rejects missing and invented expression fields", () => {
  const valid = {
    mode: "BOUNDARY",
    fields: { boundary: "不查看手机", reason: "", acceptableRange: "可以询问", selfProtectiveAction: "结束谈话" },
    uncertainties: [],
    conversation: {
      state: "READY", reflection: "你希望清楚表达不查看手机的边界。", tentativeUnderstanding: "",
      question: "", questionIntent: "NONE", stopReason: "SUFFICIENT_CONTEXT",
    },
    grounding: {
      boundary: { status: "USER_STATED", sources: ["SOURCE"] },
      reason: { status: "MISSING", sources: [] },
      acceptableRange: { status: "USER_STATED", sources: ["SOURCE"] },
      selfProtectiveAction: { status: "USER_STATED", sources: ["SOURCE"] },
    },
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  };
  assert.equal(isExpressionResult(valid, "BOUNDARY"), true);
  assert.equal(isExpressionResult({
    ...valid,
    fields: { ...valid.fields, diagnosis: "控制欲" },
  }, "BOUNDARY"), false);
  assert.equal(isExpressionResult({
    ...valid,
    uncertainties: ["问题一？", "问题二？", "问题三？", "问题四？"],
  }, "BOUNDARY"), false);
  assert.equal(isExpressionResult({
    ...valid,
    fields: { ...valid.fields, reason: "AI 猜测他害怕失去控制" },
    grounding: { ...valid.grounding, reason: { status: "MISSING", sources: [] } },
  }, "BOUNDARY"), false);
  assert.equal(isExpressionResult({
    ...valid,
    safetyDisposition: "PAUSE",
    safetyMessage: "如果有迫近危险，请先离开现场并联系可信任支持。",
  }, "BOUNDARY"), false);
  assert.equal(isExpressionResult({
    ...valid,
    safetyDisposition: "PAUSE",
    safetyMessage: "如果有迫近危险，请先离开现场并联系可信任支持。",
    conversation: { ...valid.conversation, stopReason: "SAFETY" },
  }, "BOUNDARY"), true);
  assert.equal(isExpressionResult({
    ...valid,
    conversation: { ...valid.conversation, stopReason: "TURN_LIMIT" },
  }, "BOUNDARY"), false);
});

test("private clarification envelopes become bounded model context", () => {
  const context = parseExpressionConversationSource(
    "原始表达\n\n<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>\n" + JSON.stringify({
      privateClarifications: [{ question: "你最在意什么？", answer: "我在意是否被重视。" }],
    }),
  );
  assert.equal(context.sourceText, "原始表达");
  assert.deepEqual(context.turns, [{ question: "你最在意什么？", answer: "我在意是否被重视。" }]);
  assert.deepEqual(context.sourceRefs, ["SOURCE", "CURRENT_DRAFT", "TURN.1.ANSWER"]);
});

test("reflective Agent stops asking after five private turns", () => {
  const turns = Array.from({ length: 5 }, (_, index) => ({
    question: `问题 ${index + 1}`,
    answer: `回答 ${index + 1}`,
  }));
  const context = {
    turns,
    sourceRefs: ["SOURCE", "CURRENT_DRAFT", ...turns.map((_, index) => `TURN.${index + 1}.ANSWER`)],
  };
  const result = validNvcExpressionResult("READY");
  result.conversation.stopReason = "TURN_LIMIT";
  assert.equal(isExpressionResult(result, "NVC", context), true);
  result.conversation.state = "ASK";
  result.conversation.question = "还要继续吗？";
  result.conversation.questionIntent = "VERIFY_UNDERSTANDING";
  result.conversation.stopReason = "NEEDS_CLARIFICATION";
  result.uncertainties = ["还要继续吗？"];
  assert.equal(isExpressionResult(result, "NVC", context), false);
});

test("shared understanding schemas are strict, traceable, and independently reviewed", () => {
  assert.equal(understandingResultSchema.additionalProperties, false);
  assert.equal(understandingReviewSchema.additionalProperties, false);
  const valid = validMutualUnderstandingResult();
  assert.equal(isUnderstandingResult(valid), true);
  assert.equal(isUnderstandingResult({
    ...valid,
    mutualUnderstanding: valid.mutualUnderstanding.slice(0, 1),
  }), false);
  assert.equal(isUnderstandingResult({
    ...valid,
    newUnderstanding: { text: "只有 A 的回应", sources: ["DIALOGUE.RESPONSE.A.1"] },
  }), false);
  assert.equal(isUnderstandingResult({
    ...valid,
    mutualUnderstanding: valid.mutualUnderstanding.map((item) => ({
      ...item,
      sources: item.sources.filter((source) => !source.includes("REFLECTION_CONFIRMATION")),
    })),
  }), false);
  assert.equal(isUnderstandingResult({
    ...valid,
    mutualUnderstanding: valid.mutualUnderstanding.map((item) => ({ ...item, listenerRole: "A" })),
  }), false);
  assert.equal(isUnderstandingResult({
    ...valid,
    differences: [{
      topic: "何时告知", sideA: "A.request", sideB: "B.request",
      sources: ["A.request", "B.request"],
    }],
  }), false);
  assert.equal(isUnderstandingResult({
    ...valid,
    boundaries: [{ text: "希望当天告诉我", sources: ["A.request"] }],
  }), false);
  assert.equal(isUnderstandingReview({
    verdict: "PASS", issues: [], safetyDisposition: "ALLOW", safetyMessage: "",
  }), true);
  assert.equal(isUnderstandingReview({
    verdict: "PASS", issues: [], safetyDisposition: "WARN", safetyMessage: "请先确认是否适合继续分享。",
  }), true);
  assert.equal(isUnderstandingReview({
    verdict: "PASS", issues: [], safetyDisposition: "PAUSE", safetyMessage: "请暂停。",
  }), false);
  assert.equal(isUnderstandingReview({
    verdict: "BLOCK", issues: [{ code: "UNSAFE", message: "存在伤害风险", sources: [] }],
    safetyDisposition: "ALLOW", safetyMessage: "",
  }), false);
  assert.equal(isUnderstandingReview({
    verdict: "PASS",
    issues: [{ code: "FALSE_CONSENSUS", message: "共同点只有单方依据", sources: ["A.need"] }],
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  }), false);
  assert.equal(isUnderstandingReview({
    verdict: "REVISE", issues: [], safetyDisposition: "ALLOW", safetyMessage: "",
  }), false);
});

test("shared understanding normalization removes repeated model sections before review", () => {
  const difference = {
    topic: "关于沟通和需求的分歧",
    sideA: "A 希望被关心和理解",
    sideB: "B 希望对方不要烦他",
    sources: ["A.need", "B.request"],
  };
  const normalized = normalizeUnderstandingResult({
    ...validMutualUnderstandingResult(),
    differences: [difference, { ...difference }, { ...difference }],
  }) as { differences: unknown[] };
  assert.equal(normalized.differences.length, 1);
});

test("understanding confirmation validation binds the exact reviewed hash", () => {
  const roomId = "11111111-1111-4111-8111-111111111111";
  const resultId = "22222222-2222-4222-8222-222222222222";
  const hash = "a".repeat(64);
  assert.deepEqual(validateRpcArgs("confirm_understanding_v2", {
    p_room_id: roomId,
    p_result_id: resultId,
    p_candidate_hash: hash,
    p_decision: "ACCURATE",
    p_feedback_text: "",
  }), {
    p_room_id: roomId,
    p_result_id: resultId,
    p_candidate_hash: hash,
    p_decision: "ACCURATE",
    p_feedback_text: "",
  });
  assert.equal(validateRpcArgs("confirm_understanding_v2", {
    p_room_id: roomId,
    p_result_id: resultId,
    p_candidate_hash: hash,
    p_decision: "INACCURATE",
    p_feedback_text: "   ",
  }), null);
});

test("dialogue RPC validation binds each append to a revision and focus turn", () => {
  const roomId = "11111111-1111-4111-8111-111111111111";
  const turnId = "22222222-2222-4222-8222-222222222222";
  assert.equal(isAllowedRpcMethod("get_dialogue_state_v2"), true);
  assert.deepEqual(validateRpcArgs("append_dialogue_turn_v2", {
    p_room_id: roomId,
    p_expected_revision: 4,
    p_turn_kind: "REFLECTION",
    p_reply_to_turn_id: turnId,
    p_payload: { text: "我听见你希望先把话说完。" },
  }), {
    p_room_id: roomId,
    p_expected_revision: 4,
    p_turn_kind: "REFLECTION",
    p_reply_to_turn_id: turnId,
    p_payload: { text: "我听见你希望先把话说完。" },
  });
  assert.equal(validateRpcArgs("append_dialogue_turn_v2", {
    p_room_id: roomId, p_expected_revision: 4, p_turn_kind: "AI_SUMMARY",
    p_reply_to_turn_id: turnId, p_payload: { text: "伪造总结" },
  }), null);
});

test("Workers AI request uses Qwen with a bounded JSON schema", async () => {
  const captured: { model?: string; input?: Record<string, unknown> } = {};
  const generated = await generateExpressionCandidate({
    AI: {
      async run(model, input) {
        captured.model = model;
        captured.input = input;
        const result = validNvcExpressionResult("ASK");
        return {
          id: "cf_req_test",
          response: null,
          choices: [{ message: { content: null, reasoning: JSON.stringify(result) } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        };
      },
    },
  }, {
    mode: "NVC",
    sourceText: "我们约好周五确认，但周日还没有消息。",
    manualPayload: { request: "如果有变化，希望当天告诉我。", internalNote: "不能发送" },
  });
  assert.equal(generated.providerRequestRef, "cf_req_test");
  assert.equal(generated.tokenInput, 10);
  assert.equal(generated.tokenOutput, 20);
  assert.equal((generated.result as { mode?: unknown }).mode, "NVC");
  assert.equal(captured.model, TEXT_MODEL);
  assert.equal(
    ((captured.input?.response_format as { type?: string }).type),
    "json_schema",
  );
  assert.equal(captured.input?.max_tokens, 2200);
  assert.equal(captured.input?.temperature, 0.1);
  assert.deepEqual(captured.input?.chat_template_kwargs, { enable_thinking: false });
  assert.match(JSON.stringify(captured.input), /第一次调用也允许 READY/);
  assert.match(JSON.stringify(captured.input), /反思式表达澄清 Agent/);
  assert.match(JSON.stringify(captured.input), /不要重复已经回答的问题/);
  assert.match(JSON.stringify(captured.input), /情感困扰本身不是阻止分享的理由/);
  assert.match(JSON.stringify(captured.input), /feeling 只能写当前用户本人的感受/);
  assert.match(JSON.stringify(captured.input), /男朋友说他很烦，我感到难过、不舒服/);
  assert.match(JSON.stringify(captured.input), /如果有变化，希望当天告诉我/);
  assert.doesNotMatch(JSON.stringify(captured.input), /internalNote|不能发送/);
});

test("private discovery asks before any expression path is selected", async () => {
  const captured: { input?: Record<string, unknown> } = {};
  const generated = await generateDiscoveryQuestion({
    AI: {
      async run(_model, input) {
        captured.input = input;
        return { response: JSON.stringify({
          question: "他说‘觉得很烦’之前，你当时具体提醒了什么？",
          ready: false,
          safetyDisposition: "ALLOW",
          safetyMessage: "",
        }) };
      },
    },
  }, {
    sourceText: "我男朋友不想提醒我睡觉，并且觉得很烦。",
    turns: [],
  });
  assert.deepEqual(generated.result, {
    question: "他说‘觉得很烦’之前，你当时具体提醒了什么？",
    ready: false,
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  });
  assert.equal(discoveryResultSchema.additionalProperties, false);
  assert.match(JSON.stringify(captured.input), /绝不能生成表达卡/);
  assert.match(JSON.stringify(captured.input), /不能推荐或预设非暴力沟通/);
});

test("private discovery can end only after at least one path-neutral follow-up", async () => {
  const completed = await generateDiscoveryQuestion({
    AI: {
      async run() {
        return { response: JSON.stringify({
          question: "",
          ready: true,
          safetyDisposition: "ALLOW",
          safetyMessage: "",
        }) };
      },
    },
  }, {
    sourceText: "我男朋友不想提醒我睡觉，并且觉得很烦。",
    turns: [{ question: "当时发生了什么？", answer: "我请他十一点提醒我，他说不想每天提醒。" }],
  });
  assert.equal((completed.result as { ready: boolean }).ready, true);
  assert.equal(isDiscoveryResult({
    question: "",
    ready: true,
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  }, true), false);
  assert.equal(isDiscoveryResult({
    question: "还发生了什么？",
    ready: true,
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  }), false);
});

test("private discovery shares the five-turn stop and repeat policy", async () => {
  const turns = Array.from({ length: 5 }, (_, index) => ({
    question: `第 ${index + 1} 个问题？`,
    answer: `第 ${index + 1} 个回答。`,
  }));
  const captured: { input?: Record<string, unknown> } = {};
  const completed = await generateDiscoveryQuestion({
    AI: {
      async run(_model, input) {
        captured.input = input;
        return { response: JSON.stringify({
          question: "",
          ready: true,
          safetyDisposition: "ALLOW",
          safetyMessage: "",
        }) };
      },
    },
  }, { sourceText: "我想把这件事说清楚。", turns });
  assert.equal((completed.result as { ready: boolean }).ready, true);
  assert.match(JSON.stringify(captured.input), /现已达到五轮/);
  assert.equal(isDiscoveryResult({
    question: "还想补充什么？",
    ready: false,
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  }, false, turns), false);
  assert.equal(isDiscoveryResult({
    question: "第 1 个问题? ",
    ready: false,
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  }, false, turns.slice(0, 1)), false);
});

test("consensus Agent sends only confirmed cards to Workers AI", async () => {
  const captured: { input?: Record<string, unknown> } = {};
  const baseResult = validMutualUnderstandingResult();
  const result = {
    ...baseResult,
    differences: [...baseResult.differences, { ...baseResult.differences[0] }],
    boundaries: [{ text: "模型虚构的边界", sources: ["A.boundary"] }],
  };
  const generated = await generateSharedUnderstanding({
    AI: {
      async run(_model, input) {
        captured.input = input;
        return {
          choices: [{ message: { content: JSON.stringify(result) } }],
          usage: { prompt_tokens: 20, completion_tokens: 30 },
        };
      },
    },
  }, {
    expressionA: {
      mode: "NVC",
      payload: { need: "确定感", request: "可能变化时告诉我", internalNote: "不得发送" },
    },
    expressionB: { mode: "NVC", payload: { need: "准确", request: "确认变化后告诉你" } },
    dialogueTimeline: validMutualDialogueTimeline(),
  });
  const requestText = JSON.stringify(captured.input);
  assert.equal(requestText.includes("sourceText"), false);
  assert.equal(requestText.includes("raw transcript"), false);
  assert.equal(requestText.includes("internalNote"), false);
  assert.equal(requestText.includes("不得发送"), false);
  assert.equal(requestText.includes("内部 ID"), false);
  assert.equal(requestText.includes("绝不能填写 A.request"), true);
  assert.equal(requestText.includes("confirmedDialogueTimeline"), true);
  assert.deepEqual((generated.result as { boundaries?: unknown }).boundaries, []);
  assert.equal(
    (generated.result as { differences?: unknown[] }).differences?.length,
    1,
  );
});

test("consensus Agent rejects a claimed understanding without an accurate reply chain", async () => {
  let calls = 0;
  const brokenTimeline = validMutualDialogueTimeline().map((turn) => turn.sequence === 3
    ? { ...turn, payload: { decision: "NEEDS_CORRECTION", feedback: "还没听懂" } }
    : turn);
  await assert.rejects(() => generateSharedUnderstanding({
    AI: {
      async run() {
        calls += 1;
        return { response: JSON.stringify(validMutualUnderstandingResult()) };
      },
    },
  }, {
    expressionA: { mode: "NVC", payload: { request: "变化时告诉我" } },
    expressionB: { mode: "NVC", payload: { request: "确认后告诉你" } },
    dialogueTimeline: brokenTimeline,
  }));
  assert.equal(calls, 2);
});

test("review Agent uses a separate Cloudflare-hosted reasoning model", async () => {
  const captured: { model?: string; input?: Record<string, unknown> } = {};
  const expressionA = { mode: "NVC" as const, payload: { need: "及时信息", request: "当天告诉我" } };
  const expressionB = { mode: "NVC" as const, payload: { need: "准确信息", request: "确认后告诉你" } };
  const candidate = validMutualUnderstandingResult();
  const reviewed = await reviewSharedUnderstanding({
    AI: {
      async run(model, input) {
        captured.model = model;
        captured.input = input;
        return {
          response: JSON.stringify({
            verdict: "PASS", issues: [], safetyDisposition: "ALLOW", safetyMessage: "",
          }),
        };
      },
    },
  }, { expressionA, expressionB, candidate });
  assert.equal(reviewed.model, REVIEW_MODEL);
  assert.equal(captured.model, REVIEW_MODEL);
  assert.equal(captured.input?.chat_template_kwargs, undefined);
});

test("Workers AI retries invalid structured output once and accounts for both attempts", async () => {
  let calls = 0;
  const valid = validNvcExpressionResult("ASK");
  const generated = await generateExpressionCandidate({
    AI: {
      async run() {
        calls += 1;
        return {
          choices: [{ message: { content: calls === 1 ? "not json" : JSON.stringify(valid) } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        };
      },
    },
  }, { mode: "NVC", sourceText: "周日还没有消息。" });
  assert.equal(calls, 2);
  assert.equal(generated.tokenInput, 20);
  assert.equal(generated.tokenOutput, 40);
});

test("initial expression generation may stop when context is already sufficient", async () => {
  let calls = 0;
  const generated = await generateExpressionCandidate({
    AI: {
      async run() {
        calls += 1;
        return {
          response: JSON.stringify(validNvcExpressionResult("READY")),
        };
      },
    },
  }, { mode: "NVC", sourceText: "周日还没有消息。" });
  assert.equal(calls, 1);
  assert.deepEqual((generated.result as { uncertainties: unknown }).uncertainties, []);
});

test("AI may finish questioning after a private clarification answer", async () => {
  const generated = await generateExpressionCandidate({
    AI: {
      async run() {
        const result = validNvcExpressionResult("READY");
        result.grounding.need = { status: "USER_CONFIRMED", sources: ["TURN.1.ANSWER"] };
        return {
          response: JSON.stringify(result),
        };
      },
    },
  }, {
    mode: "NVC",
    sourceText: "周日还没有消息。\n\n<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>\n" + JSON.stringify({
      privateClarifications: [{ question: "你最在意什么？", answer: "我需要确定感。" }],
    }),
  });
  assert.deepEqual((generated.result as { uncertainties: unknown }).uncertainties, []);
});

test("reflective Agent rejects repeated questions and ungrounded inferred fields", async () => {
  let calls = 0;
  await assert.rejects(generateExpressionCandidate({
    AI: {
      async run() {
        calls += 1;
        const result = validNvcExpressionResult("ASK");
        result.conversation.question = "这次没有消息时，你最希望对方理解哪一种影响? ";
        result.uncertainties = [result.conversation.question];
        result.fields.need = "你害怕被抛弃";
        result.grounding.need = { status: "MISSING", sources: [] };
        return { response: JSON.stringify(result) };
      },
    },
  }, {
    mode: "NVC",
    sourceText: "周日还没有消息。\n\n<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>\n" + JSON.stringify({
      privateClarifications: [{
        question: "这次没有消息时，你最希望对方理解哪一种影响？",
        answer: "我还没有想清楚。",
      }],
    }),
  }), /CLOUDFLARE_AI_INVALID_OUTPUT/);
  assert.equal(calls, 2);
});

test("Workers AI quota exhaustion is reported without an automatic retry", async () => {
  let calls = 0;
  await assert.rejects(generateExpressionCandidate({
    AI: {
      async run() {
        calls += 1;
        throw { code: 3036, status: 429, message: "daily free allocation exhausted" };
      },
    },
  }, { mode: "NVC", sourceText: "周日还没有消息。" }), /CLOUDFLARE_AI_QUOTA_EXHAUSTED/);
  assert.equal(calls, 1);
});

test("audio transcription uses the Cloudflare-hosted Whisper model", async () => {
  const captured: { model?: string; input?: Record<string, unknown> } = {};
  const text = await transcribeAudio({
    AI: {
      async run(model, input) {
        captured.model = model;
        captured.input = input;
        return { text: "这是测试录音" };
      },
    },
  }, new File(["audio bytes"], "recording.webm", { type: "audio/webm" }));
  assert.equal(text, "这是测试录音");
  assert.equal(captured.model, TRANSCRIPTION_MODEL);
  assert.equal(Buffer.from(String(captured.input?.audio), "base64").toString(), "audio bytes");
  assert.equal(captured.input?.language, "zh");
  assert.equal(captured.input?.condition_on_previous_text, false);
});

test("audio validation accepts browser codec parameters but rejects fake formats", () => {
  assert.equal(isSupportedAudio(new File(["audio"], "recording.webm", {
    type: "audio/webm;codecs=opus",
  })), true);
  assert.equal(isSupportedAudio(new File(["nope"], "recording.exe", {
    type: "application/octet-stream",
  })), false);
});
