import assert from "node:assert/strict";
import test from "node:test";
import { isTextAIConfigured, requestStructuredOutput, REVIEW_MODEL } from "../src/cloudflare-ai.ts";
import { OPENCODE_BASE_URL, OPENCODE_TEXT_MODEL } from "../src/opencode-ai.ts";

const env = { TEXT_AI_PROVIDER: "opencode", OPENCODE_API_KEY: "test-provider-key" };
const options = {
  schemaName: "provider_test",
  schema: {
    type: "object", properties: { ok: { type: "boolean" } },
    required: ["ok"], additionalProperties: false,
  },
  systemText: "Return a JSON object.",
  userData: { text: "synthetic input" },
  maxTokens: 128,
  validate(value: unknown) { return (value as { ok?: boolean } | null)?.ok === true; },
};

function completion(content: string, tokens = 2) {
  return Response.json({
    id: "synthetic-request", choices: [{ message: { content } }],
    usage: { prompt_tokens: tokens, completion_tokens: tokens + 1 },
  });
}

test("OpenCode uses the fixed paid endpoint and selected model for generation and review", async (t) => {
  const calls: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, `${OPENCODE_BASE_URL}/chat/completions`);
    assert.equal(init.redirect, "manual");
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer test-provider-key");
    calls.push(JSON.parse(String(init.body)));
    return completion('{"ok":true}');
  });
  for (const model of [undefined, REVIEW_MODEL]) {
    const generated = await requestStructuredOutput(env, { ...options, model });
    assert.equal(generated.model, OPENCODE_TEXT_MODEL);
    assert.equal(generated.providerRequestRef, "synthetic-request");
    assert.equal(generated.tokenInput, 2);
    assert.equal(generated.tokenOutput, 3);
  }
  assert.equal(calls.length, 2);
  for (const body of calls) {
    assert.equal(body.model, "deepseek-v4.1-flash");
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.deepEqual(body.response_format, {
      type: "json_schema", json_schema: { name: options.schemaName, strict: true, schema: options.schema },
    });
    assert.equal(body.max_tokens, 128);
    assert.equal(body.chat_template_kwargs, undefined);
  }
});

test("provider selection fails closed without a key or with an unknown provider", async () => {
  const cloudflare = { async run() { throw new Error("must not fall back"); } };
  assert.equal(isTextAIConfigured({ AI: cloudflare }), true);
  assert.equal(isTextAIConfigured(env), true);
  assert.equal(isTextAIConfigured({ TEXT_AI_PROVIDER: "typo", AI: cloudflare }), false);
  await assert.rejects(requestStructuredOutput({ ...env, OPENCODE_API_KEY: " ", AI: cloudflare }, options),
    /OPENCODE_AI_NOT_CONFIGURED/);
});

test("invalid JSON retries are bounded, include repair instructions and accumulate usage", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    calls++;
    if (calls > 1) assert.match(String(init.body), /上一次输出未通过校验/);
    return completion(calls === 1 ? "bad JSON" : '{"ok":true}', calls);
  });
  const result = await requestStructuredOutput(env, options);
  assert.equal(calls, 2);
  assert.equal(result.tokenInput, 3);
  assert.equal(result.tokenOutput, 5);
});

test("private reasoning is never accepted as a generated result", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ choices: [{ message: { content: null, reasoning_content: '{"ok":true}' } }] });
  });
  await assert.rejects(requestStructuredOutput(env, options), /OPENCODE_AI_INVALID_OUTPUT/);
  assert.equal(calls, 2);
});

test("HTTP failures have sanitized codes without leaking upstream bodies or switching providers", async (t) => {
  let status = 429;
  const fakeFetch = t.mock.method(globalThis, "fetch", async () => new Response("private upstream error", { status }));
  for (const code of [429, 503, 401, 403, 301, 302, 307, 308]) {
    status = code;
    await assert.rejects(requestStructuredOutput(env, options), {
      message: code === 429 || code >= 500 ? "OPENCODE_AI_RETRYABLE" : "OPENCODE_AI_REQUEST_FAILED",
    });
  }
  assert.equal(fakeFetch.mock.callCount(), 8);
});

test("network failures are retryable and do not expose the original error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("private token and request"); });
  await assert.rejects(requestStructuredOutput(env, options), { message: "OPENCODE_AI_RETRYABLE" });
});

test("timeouts while reading the response remain retryable", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    async json() { throw new DOMException("private transport details", "TimeoutError"); },
  }));
  await assert.rejects(requestStructuredOutput(env, options), { message: "OPENCODE_AI_RETRYABLE" });
});
