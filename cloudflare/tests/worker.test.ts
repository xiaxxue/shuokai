import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { REVIEW_MODEL, TEXT_MODEL, TRANSCRIPTION_MODEL, transcribeAudio } from "../src/cloudflare-ai.ts";
import {
  handleExpressionClarification,
  handleMiniappApi,
  isSupportedAudio,
  isValidDiscoveryTurns,
  safeDatabaseMessages,
  type ClarificationDependencies,
} from "../src/handlers.ts";
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
  fallbackInvitationDraft,
  generateInvitationDraft,
  invitationContextFromRecords,
  invitationSourceFromExpression,
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
  discoveryFieldDefinitions,
  discoveryResultSchema,
  generateDiscoveryQuestion,
  isDiscoveryResult,
  normalizeDiscoveryResult,
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

function validInvitationDraftResult(sourceField = "observation") {
  return {
    ready: true,
    title: "关于周日仍未收到消息",
    summary: "我们约好周五确认，但到周日仍没有收到消息。这份邀请希望你也讲讲自己记得的情况和期待。",
    context: {
      people: ["我们"],
      time: "周日",
      place: null,
      event: "到周日仍没有收到约定的消息",
      whyInvite: "邀请对方讲讲自己记得的情况和期待",
    },
    missingFacts: ["place"],
    sourceField,
  };
}

function requestedSchemaTitle(input: unknown) {
  const responseFormat = input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>).response_format
    : null;
  const jsonSchema = responseFormat && typeof responseFormat === "object" && !Array.isArray(responseFormat)
    ? (responseFormat as Record<string, unknown>).json_schema
    : null;
  return jsonSchema && typeof jsonSchema === "object" && !Array.isArray(jsonSchema)
    ? String((jsonSchema as Record<string, unknown>).title ?? "")
    : "";
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

function enough(evidence: string[]) {
  return { status: "ENOUGH", evidence, missingInfo: "", relevanceReason: "" } as const;
}

function missing(missingInfo: string) {
  return { status: "MISSING", evidence: [], missingInfo, relevanceReason: "" } as const;
}

function notRelevant(relevanceReason = "该信息不影响本次理解") {
  return { status: "NOT_RELEVANT", evidence: [], missingInfo: "", relevanceReason } as const;
}

function validDiscoveryReadyResult() {
  return {
    schemaVersion: 3,
    ready: true,
    coverage: {
      event: {
        participants: enough(["他"]),
        setting: enough(["昨晚"]),
        trigger: enough(["他说不想每天提醒"]),
        keyInteraction: enough(["他说不想每天提醒"]),
        conflictPoint: enough(["他说不想每天提醒"]),
        historyPattern: notRelevant(),
        currentState: notRelevant(),
      },
      userImpact: {
        emotion: enough(["我很失望"]),
        physicalReaction: notRelevant(),
        realLifeConsequence: notRelevant(),
      },
      meaningToCommunicate: {
        personalMeaning: enough(["希望他睡前问我一次"]),
        underlyingNeed: notRelevant(),
      },
      desiredResponse: {
        desiredUnderstanding: notRelevant(),
        desiredAction: enough(["希望他睡前问我一次"]),
        acceptableAlternative: notRelevant(),
      },
    },
    latestAnswerUpdate: { absorbed: true, updatedFields: ["desiredResponse.desiredAction"] },
    nextQuestion: { focusField: "none", text: "", purpose: "" },
    safetyDisposition: "ALLOW",
    safetyMessage: "",
    conversationSummary: "用户希望对方睡前提醒休息。",
    memoryCandidates: [],
  } as const;
}

function discoveryCoverageFixture(input: {
  eventEvidence: string;
  impactEvidence?: string;
  meaningEvidence?: string;
  desiredEvidence?: string;
}) {
  return {
    event: {
      participants: enough([input.eventEvidence]),
      setting: notRelevant(),
      trigger: enough([input.eventEvidence]),
      keyInteraction: enough([input.eventEvidence]),
      conflictPoint: enough([input.eventEvidence]),
      historyPattern: notRelevant(),
      currentState: notRelevant(),
    },
    userImpact: {
      emotion: input.impactEvidence ? enough([input.impactEvidence]) : missing("缺少用户本人的感受或后果"),
      physicalReaction: notRelevant(),
      realLifeConsequence: notRelevant(),
    },
    meaningToCommunicate: {
      personalMeaning: input.meaningEvidence ? enough([input.meaningEvidence]) : missing("缺少这件事对用户代表什么"),
      underlyingNeed: notRelevant(),
    },
    desiredResponse: {
      desiredUnderstanding: input.desiredEvidence ? enough([input.desiredEvidence]) : missing("缺少希望对方理解或回应的重点"),
      desiredAction: notRelevant(),
      acceptableAlternative: notRelevant(),
    },
  };
}

function clarificationRequest() {
  return new Request("https://shuokai.example/ai/clarify", {
    method: "POST",
    headers: {
      authorization: "Bearer signed.jwt.value",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      roomId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 2,
      sourceText: "昨晚他说不想每天提醒，我很失望。",
      turns: [],
    }),
  });
}

test("private discovery schema avoids unsupported Cloudflare grammar keywords", () => {
  assert.doesNotMatch(JSON.stringify(discoveryResultSchema), /"uniqueItems"/);

  const input = {
    sourceText: "昨晚他说不想每天提醒，我很失望。",
    turns: [{ question: "你希望他怎么做？", answer: "希望他睡前问我一次" }],
  };
  const valid = structuredClone(validDiscoveryReadyResult());
  assert.equal(isDiscoveryResult(valid, input), true);
  const duplicated = {
    ...valid,
    latestAnswerUpdate: {
      ...valid.latestAnswerUpdate,
      updatedFields: ["desiredResponse.desiredAction", "desiredResponse.desiredAction"],
    },
  };
  assert.equal(isDiscoveryResult(duplicated, input), false);
});

test("private discovery repairs grounded evidence instead of rejecting an otherwise usable reply", async () => {
  const input = {
    sourceText: "前天晚上我很晚睡，伴侣已经躺下了。他没有提醒我早点睡，我很不开心。",
    turns: [{
      question: "你希望他能理解你当时的心情，还是希望以后他怎么做？",
      answer: "我以前多次告诉他，晚睡会让我心情和身体都不舒服，希望他提醒我。",
    }],
  };
  const providerResult = {
    schemaVersion: 3,
    ready: true,
    coverage: {
      event: {
        participants: enough(["伴侣"]),
        setting: enough(["前天晚上"]),
        trigger: enough(["他没有提醒我早点睡"]),
        keyInteraction: enough(["他没有提醒我早点睡"]),
        conflictPoint: enough(["他没有提醒我早点睡"]),
        historyPattern: enough(["我以前多次告诉他"]),
        currentState: notRelevant(),
      },
      userImpact: {
        emotion: enough(["我很不开心"]),
        physicalReaction: enough(["身体都不舒服"]),
        realLifeConsequence: enough(["晚睡会让我心情和身体都不舒服"]),
      },
      meaningToCommunicate: {
        personalMeaning: enough(["晚睡会让我心情和身体都不舒服"]),
        underlyingNeed: enough(["希望他提醒我"]),
      },
      desiredResponse: {
        desiredUnderstanding: notRelevant(),
        desiredAction: enough(["希望他提醒我", "希望他能理解你当时的心情"]),
        acceptableAlternative: notRelevant(),
      },
    },
    latestAnswerUpdate: {
      absorbed: true,
      updatedFields: ["event.historyPattern", "userImpact.physicalReaction", "userImpact.realLifeConsequence", "meaningToCommunicate.personalMeaning", "meaningToCommunicate.underlyingNeed", "desiredResponse.desiredAction"],
    },
    nextQuestion: { focusField: "none", text: "", purpose: "" },
    safetyDisposition: "ALLOW",
    safetyMessage: "",
    conversationSummary: "用户希望伴侣理解晚睡带来的不适，并提醒休息。",
    memoryCandidates: [],
  };

  assert.equal(isDiscoveryResult(providerResult, input), false);
  const normalized = normalizeDiscoveryResult(providerResult, input);
  assert.equal(isDiscoveryResult(normalized, input), true);
  assert.deepEqual((normalized as typeof providerResult).coverage.desiredResponse.desiredAction.evidence, ["希望他提醒我"]);
  assert.deepEqual((normalized as typeof providerResult).latestAnswerUpdate.updatedFields, [
    "event.historyPattern", "userImpact.physicalReaction", "userImpact.realLifeConsequence",
    "meaningToCommunicate.personalMeaning", "meaningToCommunicate.underlyingNeed",
    "desiredResponse.desiredAction",
  ]);

  let calls = 0;
  const generated = await generateDiscoveryQuestion({
    AI: {
      async run() {
        calls += 1;
        return { response: JSON.stringify(providerResult) };
      },
    },
  }, input);
  assert.equal(calls, 1);
  assert.deepEqual(generated.result, normalized);
});

test("private discovery does not turn an AI question into missing user evidence", () => {
  const input = {
    sourceText: "昨晚他没有提醒我休息，我很失望。",
    turns: [{ question: "你希望他以后怎么做？", answer: "我还没想好。" }],
  };
  const providerResult = {
    ...structuredClone(validDiscoveryReadyResult()),
    coverage: {
      ...structuredClone(validDiscoveryReadyResult()).coverage,
      desiredResponse: {
        desiredUnderstanding: notRelevant(),
        desiredAction: enough(["你希望他以后怎么做"]),
        acceptableAlternative: notRelevant(),
      },
    },
  };
  const normalized = normalizeDiscoveryResult(providerResult, input) as typeof providerResult;
  assert.equal(normalized.ready, false);
  assert.deepEqual(normalized.coverage.desiredResponse.desiredAction, {
    status: "MISSING",
    evidence: [],
    missingInfo: "缺少可由用户原话确认的信息",
    relevanceReason: "",
  });
  assert.equal(isDiscoveryResult(normalized, input), false);
});

function clarificationEnv() {
  return {
    SUPABASE_URL: "https://project.example.test",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    AI: { run: async () => ({}) },
  };
}

function clarificationHarness(options: {
  membershipError?: { code: string };
  memoryError?: { code: string };
  latestMemoryContext?: unknown;
  saveError?: { code: string };
  restoreError?: { code: string };
  generateError?: string;
  existingConversation?: unknown;
} = {}) {
  const userRpcCalls: Array<{ name: string; args: unknown }> = [];
  const adminRpcCalls: Array<{ name: string; args: unknown }> = [];
  let generatedInput: unknown = null;
  const restoredProposal = {
    id: "22222222-2222-4222-8222-222222222222",
    kind: "NEED",
    content: "被关心",
    reason: "以后讨论照顾方式时可能有用。",
    status: "PROPOSED",
  };
  const dependencies = {
    userClient: () => ({
      auth: {
        getClaims: async () => ({
          data: { claims: { sub: "80000000-0000-4000-8000-000000000001" } },
          error: null,
        }),
      },
      rpc: async (name: string, args: unknown) => {
        userRpcCalls.push({ name, args });
        if (name === "get_expression_workspace_v2") {
          return { data: options.membershipError ? null : {}, error: options.membershipError ?? null };
        }
        if (name === "get_ai_memory_context_v1") {
          const memoryCallCount = userRpcCalls.filter((call) => call.name === name).length;
          return {
            data: options.memoryError ? null : memoryCallCount > 1 && options.latestMemoryContext
              ? options.latestMemoryContext : {
              personal: [{ kind: "NEED", content: "被关心" }],
              relationship: [],
            },
            error: options.memoryError ?? null,
          };
        }
        if (name === "get_ai_private_conversation_v1") {
          return {
            data: options.restoreError ? null : options.existingConversation ?? {
              revision: 0,
              sourceText: "",
              turns: [],
              memoryProposals: [restoredProposal],
            },
            error: options.restoreError ?? null,
          };
        }
        throw new Error(`unexpected user RPC ${name}`);
      },
    }),
    adminClient: () => ({
      rpc: async (name: string, args: unknown) => {
        adminRpcCalls.push({ name, args });
        return {
          data: options.saveError ? null : { revision: 3, memoryProposalIds: [restoredProposal.id] },
          error: options.saveError ?? null,
        };
      },
    }),
    generateDiscoveryQuestion: async (_env: unknown, input: unknown) => {
      generatedInput = input;
      if (options.generateError) throw new Error(options.generateError);
      return {
        result: validDiscoveryReadyResult(),
        providerRequestRef: "cf_req_test",
        tokenInput: 10,
        tokenOutput: 20,
      };
    },
  } as unknown as ClarificationDependencies;
  return {
    dependencies,
    userRpcCalls,
    adminRpcCalls,
    restoredProposal,
    generatedInput: () => generatedInput,
  };
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
    invitation_title: "关于视频聊天中的一句话",
    invitation_summary: "在一次视频聊天中，对方提到另一个女生好看。这份邀请希望你也讲讲当时的情况和期待。",
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
    title: "关于视频聊天中的一句话",
    summary: "在一次视频聊天中，对方提到另一个女生好看。这份邀请希望你也讲讲当时的情况和期待。",
    confirmedSummary: true,
  });
  assert.doesNotMatch(JSON.stringify(context), /难过|尊重|要求|准确理解/);
});

test("invitation summary uses only the confirmed event field and keeps unknown details absent", async () => {
  let receivedInput = "";
  let callCount = 0;
  const expression = {
    mode: "NVC",
    payload: {
      observation: "男朋友在半夜凌晨一两点争吵后说‘你总是大晚上吵’，并说他受不了。",
      feeling: "不得进入邀请摘要模型输入的难过",
      need: "不得进入邀请摘要模型输入的关心",
      request: "不得进入邀请摘要模型输入的提醒",
    },
  };
  const generated = await generateInvitationDraft({
    AI: {
      async run(_model: string, input: Record<string, unknown>) {
        callCount += 1;
        receivedInput = JSON.stringify(input);
        return {
          response: {
            ready: true,
            title: "关于凌晨争吵中的一句话",
            summary: "在凌晨一两点的一次争吵后，男朋友说‘你总是大晚上吵’，并表示自己受不了。这份邀请希望你也讲讲当时的情况和期待。",
            context: {
              people: ["男朋友"],
              time: "凌晨一两点",
              place: null,
              event: "争吵后男朋友说‘你总是大晚上吵’，并表示自己受不了",
              whyInvite: "邀请对方讲讲当时的情况和期待",
            },
            missingFacts: ["place"],
            sourceField: "observation",
          },
        };
      },
    },
  }, expression);
  assert.deepEqual(generated.draft, {
    ready: true,
    title: "关于凌晨争吵中的一句话",
    summary: "在凌晨一两点的一次争吵后，男朋友说‘你总是大晚上吵’，并表示自己受不了。这份邀请希望你也讲讲当时的情况和期待。",
    context: {
      people: ["男朋友"],
      time: "凌晨一两点",
      place: null,
      event: "争吵后男朋友说‘你总是大晚上吵’，并表示自己受不了",
      whyInvite: "邀请对方讲讲当时的情况和期待",
    },
    missingFacts: ["place"],
    sourceField: "observation",
    sourceHash: generated.draft.sourceHash,
    generatedByAi: true,
  });
  assert.match(generated.draft.sourceHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(receivedInput, /难过|关心|提醒/);
  assert.match(receivedInput, /凌晨一两点/);
  assert.equal(callCount, 1);
});

test("invitation summary falls back without inventing missing time or place", async () => {
  const source = invitationSourceFromExpression({
    mode: "FACT_DISPUTE",
    payload: { claim: "对方没有按约定回复", basis: "聊天记录" },
  });
  const draft = await fallbackInvitationDraft(source);
  assert.deepEqual(draft, {
    ready: true,
    title: "关于一件待核实的事",
    summary: "发起方确认的背景是：对方没有按约定回复。这份邀请希望你也讲讲自己记得的情况和期待。",
    context: {
      people: [], time: null, place: null, event: "对方没有按约定回复",
      whyInvite: "邀请对方讲讲自己记得的情况和期待",
    },
    missingFacts: ["people", "time", "place"],
    sourceField: "claim",
    sourceHash: draft.sourceHash,
    generatedByAi: false,
  });
  assert.match(draft.sourceHash, /^[a-f0-9]{64}$/);
});

test("invitation summary remains usable when the model output is invalid", async () => {
  let callCount = 0;
  const expression = {
    mode: "BOUNDARY",
    payload: { boundary: "争吵时不要查看我的手机" },
  };
  const generated = await generateInvitationDraft({
    AI: {
      async run() {
        callCount += 1;
        return { response: { title: "", summary: "" } };
      },
    },
  }, expression);
  assert.deepEqual(generated.draft, {
    ready: true,
    title: "关于需要被尊重的边界",
    summary: "发起方确认的背景是：争吵时不要查看我的手机。这份邀请希望你也讲讲自己记得的情况和期待。",
    context: {
      people: [], time: null, place: null, event: "争吵时不要查看我的手机",
      whyInvite: "邀请对方讲讲自己记得的情况和期待",
    },
    missingFacts: ["people", "time", "place"],
    sourceField: "boundary",
    sourceHash: generated.draft.sourceHash,
    generatedByAi: false,
  });
  assert.equal(callCount, 2);
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

test("profile and relationship context RPCs require bounded explicit consent fields", () => {
  const roomId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(validateRpcArgs("save_my_profile_v1", {
    p_expected_revision: 0,
    p_display_name: "  小　雨 ",
    p_response_length: "SHORT",
    p_language: "简体中文",
    p_use_response_length_ai: true,
    p_use_language_ai: false,
  }), {
    p_expected_revision: 0,
    p_display_name: "小 雨",
    p_response_length: "SHORT",
    p_language: "简体中文",
    p_use_response_length_ai: true,
    p_use_language_ai: false,
  });
  assert.equal(validateRpcArgs("save_my_profile_v1", {
    p_expected_revision: 0,
    p_display_name: "小雨",
    p_response_length: "SHORT",
    p_language: null,
    p_use_response_length_ai: "yes",
    p_use_language_ai: false,
  }), null);
  const payload = {
    relationshipType: "PARTNER",
    relationshipOther: null,
    durationRange: "Y1_3",
    interactionMode: "MIXED",
    useInviterSharedAi: false,
  };
  assert.deepEqual(validateRpcArgs("respond_room_relationship_context_v1", {
    p_room_id: roomId,
    p_expected_private_revision: 0,
    p_seen_shared_revision: 1,
    p_status: "DIFFERENT",
    p_step: 4,
    p_decision: "DIFFERENT",
    p_payload: payload,
  }), {
    p_room_id: roomId,
    p_expected_private_revision: 0,
    p_seen_shared_revision: 1,
    p_status: "DIFFERENT",
    p_step: 4,
    p_decision: "DIFFERENT",
    p_payload: payload,
  });
  assert.equal(validateRpcArgs("respond_room_relationship_context_v1", {
    p_room_id: roomId,
    p_expected_private_revision: 0,
    p_seen_shared_revision: 1,
    p_status: "DIFFERENT",
    p_step: 4,
    p_decision: "DIFFERENT",
    p_payload: { ...payload, relationshipType: "DIAGNOSED_PERSONALITY" },
  }), null);
});

test("missing inviter context has a recoverable relationship-specific message", () => {
  assert.equal(
    safeDatabaseMessages.P0C02,
    "邀请方没有可确认的关系背景。请选择填写自己的版本或暂不回答。",
  );
});

test("relationship context validation gives a recoverable action instead of an internal parameter error", async () => {
  const response = await handleMiniappApi(new Request("https://shuokai.example/miniapp-api", {
    method: "POST",
    headers: {
      authorization: "Bearer signed.jwt.value",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      method: "save_room_relationship_context_v1",
      args: {
        p_room_id: "11111111-1111-4111-8111-111111111111",
        p_expected_shared_revision: 1,
        p_expected_private_revision: 1,
        p_status: "DRAFT",
        p_step: 2,
        p_shared: {
          status: "DRAFT",
          revision: 1,
          relationshipType: "PARTNER",
          relationshipOther: null,
          durationRange: "Y1_3",
          interactionMode: "MIXED",
          useSharedAi: true,
        },
        p_private: {
          status: "DRAFT",
          revision: 1,
          communicationPace: "IMMEDIATE",
          responsePreference: "EMPATHY_FIRST",
          planningStyle: "PLAN_AHEAD",
          relationshipState: null,
          observedDifference: "",
          culturalContext: "",
          useCommunicationAi: true,
          useRelationshipStateAi: true,
          useDifferenceAi: true,
          useCultureAi: false,
          useInviterSharedAi: false,
        },
      },
    }),
  }), {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: "关系背景没有保存。请重新打开这间房，确认当前选择后再试；本机草稿仍会保留。",
    code: "INVALID_ARGUMENTS",
  });
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

test("AI archive RPC validation keeps memory decisions explicit and bounded", () => {
  const memoryId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(validateRpcArgs("list_my_ai_private_conversations_v1", { p_limit: 20 }), {
    p_limit: 20,
  });
  assert.deepEqual(validateRpcArgs("decide_ai_personal_memory_v1", {
    p_memory_id: memoryId,
    p_decision: "CONFIRM",
    p_content: "计划变化时，希望提前知道。",
  }), {
    p_memory_id: memoryId,
    p_decision: "CONFIRM",
    p_content: "计划变化时，希望提前知道。",
  });
  assert.equal(validateRpcArgs("decide_ai_personal_memory_v1", {
    p_memory_id: memoryId,
    p_decision: "FORGET",
    p_content: "不能在停止记住时偷改内容",
  }), null);
  assert.equal(validateRpcArgs("list_my_ai_private_conversations_v1", { p_limit: 51 }), null);
  assert.deepEqual(validateRpcArgs("decide_ai_relationship_memory_v1", {
    p_memory_id: memoryId,
    p_decision: "STOP",
  }), {
    p_memory_id: memoryId,
    p_decision: "STOP",
  });
  assert.equal(validateRpcArgs("decide_ai_relationship_memory_v1", {
    p_memory_id: memoryId,
    p_decision: "ACCURATE",
  }), null);
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
  assert.deepEqual(validateRpcArgs("confirm_expression_version_v3", {
    p_room_id: roomId,
    p_expected_revision: 2,
    p_payload: { mode: "NVC", observation: "周日仍未收到消息" },
    p_invitation_title: " 关于周日仍未收到消息 ",
    p_invitation_summary: " 我们约好周五确认，但到周日仍没有消息。这份邀请希望你也讲讲自己记得的情况和期待。 ",
  }), {
    p_room_id: roomId,
    p_expected_revision: 2,
    p_payload: { mode: "NVC", observation: "周日仍未收到消息" },
    p_invitation_title: "关于周日仍未收到消息",
    p_invitation_summary: "我们约好周五确认，但到周日仍没有消息。这份邀请希望你也讲讲自己记得的情况和期待。",
  });
  assert.equal(validateRpcArgs("confirm_expression_version_v3", {
    p_room_id: roomId,
    p_expected_revision: 2,
    p_payload: { mode: "NVC", observation: "周日仍未收到消息" },
    p_invitation_title: "太短",
    p_invitation_summary: "说明也太短",
  }), null);
});

test("Worker allowlist excludes retired demo RPCs", () => {
  assert.equal(isAllowedRpcMethod("simulate_partner"), false);
  assert.equal(isAllowedRpcMethod("demo"), false);
  assert.equal(isAllowedRpcMethod("create_room"), true);
  assert.equal(isAllowedRpcMethod("get_ai_job_status_v2"), true);
  assert.equal(isAllowedRpcMethod("confirm_expression_version_v3"), true);
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

test("AI clarification verifies membership, scopes memory context, and restores only caller proposals", async () => {
  const harness = clarificationHarness();
  const response = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), harness.dependencies,
  );
  assert.equal(response.status, 200);
  const payload = await response.json() as { revision: number; memoryProposals: unknown[] };
  assert.equal(payload.revision, 3);
  assert.deepEqual(payload.memoryProposals, [harness.restoredProposal]);
  assert.deepEqual(harness.userRpcCalls.map((call) => call.name), [
    "get_expression_workspace_v2",
    "get_ai_private_conversation_v1",
    "get_ai_memory_context_v1",
    "get_ai_memory_context_v1",
    "get_ai_private_conversation_v1",
  ]);
  assert.equal(harness.adminRpcCalls[0]?.name, "internal_save_ai_private_conversation_v2");
  assert.deepEqual((harness.adminRpcCalls[0]?.args as Record<string, unknown>).p_expected_context_version, {
    profileRevision: 0,
    participantRevision: 0,
    sharedRevision: 0,
    consentRevision: 0,
    seenSharedRevision: 0,
  });
  assert.equal(
    (((harness.adminRpcCalls[0]?.args as Record<string, unknown>).p_result as {
      understanding?: { schemaVersion?: unknown };
    }).understanding?.schemaVersion),
    3,
  );
  assert.deepEqual(harness.generatedInput(), {
    sourceText: "昨晚他说不想每天提醒，我很失望。",
    turns: [],
    memoryContext: { personal: [{ kind: "NEED", content: "被关心" }], relationship: [] },
  });
});

test("AI clarification restores an identical late result without another model call", async () => {
  const result = validDiscoveryReadyResult();
  const harness = clarificationHarness({
    existingConversation: {
      revision: 3,
      sourceText: "昨晚他说不想每天提醒，我很失望。",
      turns: [],
      question: "",
      ready: true,
      understanding: {
        schemaVersion: result.schemaVersion,
        coverage: result.coverage,
        latestAnswerUpdate: result.latestAnswerUpdate,
        nextQuestion: result.nextQuestion,
      },
      safetyDisposition: result.safetyDisposition,
      safetyMessage: result.safetyMessage,
      summary: result.conversationSummary,
      memoryProposals: [],
    },
  });

  const response = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), harness.dependencies,
  );

  assert.equal(response.status, 200);
  const payload = await response.json() as { revision: number; schemaVersion: number };
  assert.equal(payload.revision, 3);
  assert.equal(payload.schemaVersion, 3);
  assert.equal(harness.generatedInput(), null);
  assert.equal(harness.adminRpcCalls.length, 0);
  assert.deepEqual(harness.userRpcCalls.map((call) => call.name), [
    "get_expression_workspace_v2",
    "get_ai_private_conversation_v1",
  ]);
});

test("AI clarification rejects a non-member before memory or model access", async () => {
  const harness = clarificationHarness({ membershipError: { code: "42501" } });
  const response = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), harness.dependencies,
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json() as { code: string }).code, "DATABASE_REQUEST_FAILED");
  assert.deepEqual(harness.userRpcCalls.map((call) => call.name), ["get_expression_workspace_v2"]);
  assert.equal(harness.adminRpcCalls.length, 0);
  assert.equal(harness.generatedInput(), null);
});

test("AI clarification reports context read failures as database errors", async () => {
  const harness = clarificationHarness({ memoryError: { code: "P0001" } });
  const response = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), harness.dependencies,
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    message: "暂时无法读取这段私人对话的 AI 上下文，请重试或按现有内容继续整理。",
    code: "DATABASE_REQUEST_FAILED",
  });
  assert.equal(harness.generatedInput(), null);
});

test("AI clarification discards a result when profile consent changes during inference", async () => {
  const harness = clarificationHarness({
    latestMemoryContext: {
      personal: [{ kind: "NEED", content: "被关心" }],
      relationship: [],
      onboarding: {
        version: { profileRevision: 2, participantRevision: 1, sharedRevision: 1, consentRevision: 4, seenSharedRevision: 1 },
        profile: {}, myContext: {}, sharedContext: {},
      },
    },
  });
  const response = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), harness.dependencies,
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    message: "你刚刚更新了 AI 可以参考的资料，请用最新设置重新继续。",
    code: "CONTEXT_STALE",
  });
  assert.equal(harness.adminRpcCalls.length, 0);
});

test("AI clarification discards a result when inviter shared context changes during inference", async () => {
  const harness = clarificationHarness({
    latestMemoryContext: {
      personal: [{ kind: "NEED", content: "被关心" }],
      relationship: [],
      onboarding: {
        version: { profileRevision: 0, participantRevision: 0, sharedRevision: 2, consentRevision: 0, seenSharedRevision: 1 },
        profile: {}, myContext: {}, sharedContext: {},
      },
    },
  });
  const response = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), harness.dependencies,
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json() as { code: string }).code, "CONTEXT_STALE");
  assert.equal(harness.adminRpcCalls.length, 0);
});

test("AI clarification reports optimistic revision conflicts without returning generated content", async () => {
  const harness = clarificationHarness({ saveError: { code: "40001" } });
  const response = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), harness.dependencies,
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    message: "这段私人对话刚刚在别处更新，请重新打开后继续。",
    code: "PRIVATE_CONVERSATION_CONFLICT",
  });
  assert.deepEqual(harness.userRpcCalls.map((call) => call.name), [
    "get_expression_workspace_v2", "get_ai_private_conversation_v1",
    "get_ai_memory_context_v1", "get_ai_memory_context_v1",
  ]);
});

test("AI clarification rejects an atomic context conflict between final read and save", async () => {
  const harness = clarificationHarness({ saveError: { code: "P0C01" } });
  const response = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), harness.dependencies,
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json() as { code: string }).code, "CONTEXT_STALE");
  assert.deepEqual(harness.userRpcCalls.map((call) => call.name), [
    "get_expression_workspace_v2", "get_ai_private_conversation_v1",
    "get_ai_memory_context_v1", "get_ai_memory_context_v1",
  ]);
  assert.equal(harness.adminRpcCalls.length, 1);
});

test("AI clarification reports persistence and restoration failures honestly", async () => {
  const saveHarness = clarificationHarness({ saveError: { code: "P0001" } });
  const saveResponse = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), saveHarness.dependencies,
  );
  assert.equal(saveResponse.status, 502);
  assert.equal((await saveResponse.json() as { code: string }).code, "PRIVATE_CONVERSATION_SAVE_FAILED");

  const restoreHarness = clarificationHarness({ restoreError: { code: "P0001" } });
  const restoreResponse = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), restoreHarness.dependencies,
  );
  assert.equal(restoreResponse.status, 502);
  assert.equal((await restoreResponse.json() as { code: string }).code, "PRIVATE_CONVERSATION_SAVE_FAILED");
});

test("AI clarification reports invalid model output separately from provider availability", async () => {
  const invalidHarness = clarificationHarness({ generateError: "CLOUDFLARE_AI_INVALID_OUTPUT" });
  const invalidResponse = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), invalidHarness.dependencies,
  );
  assert.equal(invalidResponse.status, 502);
  assert.deepEqual(await invalidResponse.json(), {
    message: "AI 这次回复没有通过安全校验，请重试或按现有内容继续整理。",
    code: "AI_RESPONSE_INVALID",
  });

  const quotaHarness = clarificationHarness({ generateError: "CLOUDFLARE_AI_QUOTA_EXHAUSTED" });
  const quotaResponse = await handleExpressionClarification(
    clarificationRequest(), clarificationEnv(), quotaHarness.dependencies,
  );
  assert.equal(quotaResponse.status, 429);
  assert.deepEqual(await quotaResponse.json(), {
    message: "AI 今日可用额度已经用完，请按现有内容继续整理。",
    code: "AI_RATE_LIMITED",
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

test("private clarification envelopes keep all individually bounded turns", () => {
  const turns = Array.from({ length: 12 }, (_, index) => ({
    question: `问题 ${index + 1}`,
    answer: `回答 ${index + 1}`,
  }));
  const context = parseExpressionConversationSource(
    "原始表达\n\n<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>\n" + JSON.stringify({
      privateClarifications: turns,
    }),
  );
  assert.equal(context.sourceText, "原始表达");
  assert.deepEqual(context.turns, turns);
  assert.equal(context.sourceRefs.at(-1), "TURN.12.ANSWER");
});

test("reflective Agent may ask a schema-relevant question after many private turns", () => {
  const turns = Array.from({ length: 12 }, (_, index) => ({
    question: `问题 ${index + 1}`,
    answer: `回答 ${index + 1}`,
  }));
  const context = {
    turns,
    sourceRefs: ["SOURCE", "CURRENT_DRAFT", ...turns.map((_, index) => `TURN.${index + 1}.ANSWER`)],
  };
  const result = validNvcExpressionResult("ASK");
  assert.equal(isExpressionResult(result, "NVC", context), true);
});

test("clarification request validation has no conversation-count cutoff", () => {
  const turns = Array.from({ length: 20 }, (_, index) => ({
    question: `问题 ${index + 1}`,
    answer: `回答 ${index + 1}`,
  }));
  assert.equal(isValidDiscoveryTurns(turns), true);
  assert.equal(isValidDiscoveryTurns([...turns, { question: "", answer: "无效" }]), false);
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

test("private discovery asks about missing context before any expression path is selected", async () => {
  const captured: { input?: Record<string, unknown> } = {};
  const response = {
    schemaVersion: 3,
    ready: false,
    coverage: discoveryCoverageFixture({
      eventEvidence: "我男朋友不想提醒我睡觉，并且觉得很烦",
    }),
    latestAnswerUpdate: { absorbed: false, updatedFields: [] },
    nextQuestion: {
      focusField: "userImpact.emotion",
      text: "他说觉得很烦时，你自己当时是什么感受，或者这对你有什么实际影响？",
      purpose: "补充当前用户本人的体验或后果",
    },
    safetyDisposition: "ALLOW",
    safetyMessage: "",
    conversationSummary: "用户想说明提醒睡觉时发生的具体情况。",
    memoryCandidates: [],
  };
  const generated = await generateDiscoveryQuestion({
    AI: {
      async run(_model, input) {
        captured.input = input;
        return { response: JSON.stringify(response) };
      },
    },
  }, {
    sourceText: "我男朋友不想提醒我睡觉，并且觉得很烦。",
    turns: [],
  });
  assert.deepEqual(generated.result, response);
  assert.equal(discoveryResultSchema.additionalProperties, false);
  assert.match(JSON.stringify(captured.input), /绝不能生成表达卡/);
  assert.match(JSON.stringify(captured.input), /不能推荐或预设非暴力沟通/);
  assert.match(JSON.stringify(captured.input), /轮数不是完成依据/);
  assert.match(JSON.stringify(captured.input), /evidence 只能逐字摘录/);
  assert.match(JSON.stringify(captured.input), /userImpact 的主体永远是当前正在说话的用户本人/);
  assert.match(discoveryFieldDefinitions["userImpact.emotion"], /当前用户本人/);
  assert.deepEqual(discoveryResultSchema.properties.coverage.required, [
    "event", "userImpact", "meaningToCommunicate", "desiredResponse",
  ]);
});

test("private discovery keeps user impact missing when the answer only explains desired understanding", async () => {
  const input = {
    sourceText: "我晚上请伴侣提醒我早点休息，他嫌我烦。",
    turns: [{
      question: "你希望对方理解什么，或者希望沟通带来什么变化？",
      answer: "我希望他理解，提醒我早点休息是我感到被关爱的方式。",
    }],
  };
  const response = {
    schemaVersion: 3,
    ready: false,
    coverage: discoveryCoverageFixture({
      eventEvidence: "我晚上请伴侣提醒我早点休息，他嫌我烦",
      meaningEvidence: "我希望他理解，提醒我早点休息是我感到被关爱的方式",
      desiredEvidence: "我希望他理解，提醒我早点休息是我感到被关爱的方式",
    }),
    latestAnswerUpdate: {
      absorbed: true,
      updatedFields: ["meaningToCommunicate.personalMeaning", "desiredResponse.desiredUnderstanding"],
    },
    nextQuestion: {
      focusField: "userImpact.emotion",
      text: "他说你很烦时，你当时最直接的感受是什么，或者这件事对你造成了什么影响？",
      purpose: "补充当前用户本人的体验或后果",
    },
    safetyDisposition: "ALLOW",
    safetyMessage: "",
    conversationSummary: "用户希望伴侣理解提醒休息代表被关爱，但尚未说明被嫌烦后的自身感受或后果。",
    memoryCandidates: [],
  };

  const generated = await generateDiscoveryQuestion({
    AI: { async run() { return { response: JSON.stringify(response) }; } },
  }, input);
  assert.deepEqual(generated.result, response);
  assert.equal(isDiscoveryResult(response, input), true);
});

test("private discovery can finish without a ceremonial follow-up when context is already complete", async () => {
  const sourceText = "昨晚十一点我请男朋友提醒我睡觉，他说不想每天提醒。我很失望，希望他睡前问我一次要不要休息。";
  const response = {
    schemaVersion: 3,
    ready: true,
    coverage: discoveryCoverageFixture({
      eventEvidence: "昨晚十一点我请男朋友提醒我睡觉",
      impactEvidence: "我很失望",
      meaningEvidence: "希望他睡前问我一次要不要休息",
      desiredEvidence: "希望他睡前问我一次要不要休息",
    }),
    latestAnswerUpdate: { absorbed: false, updatedFields: [] },
    nextQuestion: { focusField: "none", text: "", purpose: "" },
    safetyDisposition: "ALLOW",
    safetyMessage: "",
    conversationSummary: "用户希望对方睡前提醒休息，并说明了失望感受。",
    memoryCandidates: [],
  };
  const completed = await generateDiscoveryQuestion({
    AI: {
      async run() {
        return { response: JSON.stringify(response) };
      },
    },
  }, {
    sourceText,
    turns: [],
  });
  assert.equal((completed.result as { ready: boolean }).ready, true);
  assert.equal(isDiscoveryResult(response, { sourceText, turns: [] }), true);
  assert.equal(isDiscoveryResult({
    ...response,
    nextQuestion: { focusField: "event.currentState", text: "还发生了什么？", purpose: "继续追问" },
  }, { sourceText, turns: [] }), false);
});

test("private discovery stops safely without claiming incomplete context is ready", () => {
  const sourceText = "他刚才威胁要伤害我，我很害怕。";
  const response = {
    schemaVersion: 3,
    ready: false,
    coverage: discoveryCoverageFixture({
      eventEvidence: "他刚才威胁要伤害我",
      impactEvidence: "我很害怕",
    }),
    latestAnswerUpdate: { absorbed: false, updatedFields: [] },
    nextQuestion: { focusField: "none", text: "", purpose: "" },
    safetyDisposition: "PAUSE",
    safetyMessage: "请先离开可能发生伤害的环境，并联系可信任的人或当地紧急服务。",
    conversationSummary: "用户提到迫近的安全风险。",
    memoryCandidates: [],
  };

  assert.equal(isDiscoveryResult(response, { sourceText, turns: [] }), true);
  assert.equal(isDiscoveryResult({
    ...response,
    nextQuestion: { focusField: "desiredResponse.desiredAction", text: "你希望他怎么做？", purpose: "继续追问" },
  }, { sourceText, turns: [] }), false);
});

test("private discovery retries instead of repeating an answered question", async () => {
  const repeatedQuestion = "你希望他提醒你睡觉的时候，具体是想让他提醒你做什么？";
  const turns = [{ question: repeatedQuestion, answer: "我希望他关心我。" }];
  let attempts = 0;
  let retryInput: Record<string, unknown> | undefined;
  const generated = await generateDiscoveryQuestion({
    AI: {
      async run(_model, input) {
        attempts += 1;
        if (attempts === 2) retryInput = input;
        return { response: JSON.stringify({
          schemaVersion: 3,
          ready: false,
          coverage: {
            ...discoveryCoverageFixture({
              eventEvidence: "昨晚他不愿意提醒我睡觉",
              impactEvidence: "我很难过",
              meaningEvidence: "我希望他关心我",
              desiredEvidence: "我希望他关心我",
            }),
            desiredResponse: {
              desiredUnderstanding: enough(["我希望他关心我"]),
              desiredAction: {
                status: "MISSING",
                evidence: ["我希望他关心我"],
                missingInfo: "还缺少希望对方采取的具体回应",
                relevanceReason: "",
              },
              acceptableAlternative: notRelevant(),
            },
          },
          latestAnswerUpdate: {
            absorbed: true,
            updatedFields: ["meaningToCommunicate.personalMeaning", "desiredResponse.desiredUnderstanding", "desiredResponse.desiredAction"],
          },
          nextQuestion: {
            focusField: "desiredResponse.desiredAction",
            text: attempts === 1 ? ` ${repeatedQuestion} ` : "对你来说，他怎样回应会让你感到被关心？",
            purpose: "补充可以被对方理解的具体回应",
          },
          safetyDisposition: "ALLOW",
          safetyMessage: "",
          conversationSummary: "用户正在补充提醒睡觉时希望得到的回应。",
          memoryCandidates: [],
        }) };
      },
    },
  }, {
    sourceText: "昨晚他不愿意提醒我睡觉，我很难过。",
    turns,
  });

  assert.equal(attempts, 2);
  assert.match(JSON.stringify(retryInput), /必须改问仍为 MISSING 的另一项具体信息/);
  const systemMessages = ((retryInput?.messages ?? []) as { role?: string; content?: string }[])
    .filter((message) => message.role === "system")
    .map((message) => message.content ?? "")
    .join("\n");
  assert.doesNotMatch(systemMessages, /你希望他提醒你睡觉的时候/);
  assert.equal(
    (generated.result as { nextQuestion: { text: string } }).nextQuestion.text,
    "对你来说，他怎样回应会让你感到被关心？",
  );
});

test("private discovery keeps asking for missing schema evidence after many turns", async () => {
  const turns = Array.from({ length: 12 }, (_, index) => ({
    question: `问题 ${index + 1}`,
    answer: `回答 ${index + 1}`,
  }));
  const captured: { input?: Record<string, unknown> } = {};
  const result = await generateDiscoveryQuestion({
    AI: {
      async run(_model, input) {
        captured.input = input;
        return { response: JSON.stringify({
          schemaVersion: 3,
          ready: false,
          coverage: discoveryCoverageFixture({ eventEvidence: "我们发生了争执" }),
          latestAnswerUpdate: { absorbed: true, updatedFields: [] },
          nextQuestion: {
            focusField: "userImpact.emotion",
            text: "这次争执对你造成了什么影响？",
            purpose: "补充事件带来的影响",
          },
          safetyDisposition: "ALLOW",
          safetyMessage: "",
          conversationSummary: "用户仍在补充争执造成的影响与沟通意图。",
          memoryCandidates: [],
        }) };
      },
    },
  }, { sourceText: "我们发生了争执。", turns });

  const discovery = result.result as { ready: boolean; nextQuestion: { text: string } };
  assert.equal(discovery.ready, false);
  assert.equal(discovery.nextQuestion.text, "这次争执对你造成了什么影响？");
  assert.doesNotMatch(JSON.stringify(captured.input), /达到上限|最多.*轮/);
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
      async run(_model, input) {
        calls += 1;
        return {
          response: JSON.stringify(requestedSchemaTitle(input) === "shuokai_invitation_draft_v1"
            ? validInvitationDraftResult()
            : validNvcExpressionResult("READY")),
        };
      },
    },
  }, { mode: "NVC", sourceText: "周日还没有消息。" });
  assert.equal(calls, 2);
  assert.deepEqual((generated.result as { uncertainties: unknown }).uncertainties, []);
  assert.equal((generated.result as { invitation: { title: string } }).invitation.title, "关于周日仍未收到消息");
});

test("AI may finish questioning after a private clarification answer", async () => {
  const generated = await generateExpressionCandidate({
    AI: {
      async run(_model, input) {
        if (requestedSchemaTitle(input) === "shuokai_invitation_draft_v1") {
          return { response: JSON.stringify(validInvitationDraftResult()) };
        }
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
