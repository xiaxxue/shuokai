import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedAudio } from "../src/handlers.ts";
import { bearerToken, publicSupabaseConfig } from "../src/http.ts";
import { handleRequest } from "../src/index.ts";
import { isAllowedRpcMethod, validateRpcArgs } from "../src/rpc-validation.ts";
import {
  expressionResultSchema,
  generateExpressionCandidate,
  isExpressionResult,
  parseQueueMessage,
} from "../src/expression-ai.ts";

test("health endpoint identifies the Worker", async () => {
  const response = await handleRequest(new Request("https://shuokai.example/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "shuokai-api" });
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
  assert.deepEqual(await response.json(), { message: "请先登录。" });
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

test("Worker accepts current publishable keys and legacy anon keys", () => {
  assert.deepEqual(
    publicSupabaseConfig({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    }),
    { url: "https://project.supabase.co", key: "sb_publishable_test" },
  );
  assert.deepEqual(
    publicSupabaseConfig({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "legacy-anon-key",
    }),
    { url: "https://project.supabase.co", key: "legacy-anon-key" },
  );
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

test("queue messages contain only a bounded job identifier", () => {
  const jobId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(parseQueueMessage({ jobId }), { jobId });
  assert.equal(parseQueueMessage({ jobId, sourceText: "不应进入队列" }), null);
  assert.equal(parseQueueMessage({ jobId: "not-an-id" }), null);
});

test("each AI schema is strict and path-specific", () => {
  const nvc = expressionResultSchema("NVC");
  assert.equal(nvc.additionalProperties, false);
  assert.deepEqual(nvc.properties.fields.required, ["observation", "feeling", "need", "request"]);
  const dispute = expressionResultSchema("FACT_DISPUTE");
  assert.deepEqual(dispute.properties.fields.required, ["claim", "basis", "verificationRequest"]);
});

test("AI output validation rejects missing and invented expression fields", () => {
  const valid = {
    mode: "BOUNDARY",
    fields: { boundary: "不查看手机", reason: "", acceptableRange: "可以询问", selfProtectiveAction: "结束谈话" },
    uncertainties: [],
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  };
  assert.equal(isExpressionResult(valid, "BOUNDARY"), true);
  assert.equal(isExpressionResult({
    ...valid,
    fields: { ...valid.fields, diagnosis: "控制欲" },
  }, "BOUNDARY"), false);
});

test("OpenAI request uses Structured Outputs and disables response storage", async (context) => {
  const captured: { requestBody?: Record<string, unknown> } = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    captured.requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            mode: "NVC",
            fields: { observation: "周日仍未收到消息", feeling: "失望", need: "确定感", request: "当天告诉我" },
            uncertainties: [],
            safetyDisposition: "ALLOW",
            safetyMessage: "",
          }),
        }],
      }],
      usage: { input_tokens: 10, output_tokens: 20 },
    }), { status: 200, headers: { "x-request-id": "req_test" } });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const generated = await generateExpressionCandidate({ OPENAI_API_KEY: "test-only" }, {
    mode: "NVC",
    sourceText: "我们约好周五确认，但周日还没有消息。",
  });
  assert.equal(generated.providerRequestRef, "req_test");
  assert.equal((generated.result as { mode?: unknown }).mode, "NVC");
  assert.equal(captured.requestBody?.store, false);
  assert.equal(
    ((captured.requestBody?.text as { format?: { type?: string } }).format?.type),
    "json_schema",
  );
});

test("audio validation accepts browser codec parameters but rejects fake formats", () => {
  assert.equal(isSupportedAudio(new File(["audio"], "recording.webm", {
    type: "audio/webm;codecs=opus",
  })), true);
  assert.equal(isSupportedAudio(new File(["nope"], "recording.exe", {
    type: "application/octet-stream",
  })), false);
});
