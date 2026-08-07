import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedAudio } from "../src/handlers.ts";
import { bearerToken, publicSupabaseConfig } from "../src/http.ts";
import { handleRequest } from "../src/index.ts";
import { validateRpcArgs } from "../src/rpc-validation.ts";

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

test("audio validation accepts browser codec parameters but rejects fake formats", () => {
  assert.equal(isSupportedAudio(new File(["audio"], "recording.webm", {
    type: "audio/webm;codecs=opus",
  })), true);
  assert.equal(isSupportedAudio(new File(["nope"], "recording.exe", {
    type: "application/octet-stream",
  })), false);
});
