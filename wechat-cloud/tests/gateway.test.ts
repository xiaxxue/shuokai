import assert from "node:assert/strict";
import { test } from "node:test";
import { handleGateway } from "../src/gateway.ts";
import { WechatSessionError } from "../../server/wechat-session.ts";

const env = {
  APP_ENVIRONMENT: "test",
  SHUOKAI_BACKEND_URL: "https://shuokai-supabase-test.shuokai.workers.dev",
  WECHAT_APP_ID: "wx30bafbe48a0f4d4b",
  SUPABASE_URL: "https://test-project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
};
const identity = { APPID: env.WECHAT_APP_ID, OPENID: "verified-openid", UNIONID: "verified-unionid" };
const session = { accessToken: "jwt", refreshToken: "refresh", expiresAt: 9999999999, userId: "user-id" };
const post = { path: "/miniapp-api", method: "POST", data: { method: "get_my_profile_v1", args: {} }, authorization: "Bearer jwt" };
function dependencies() {
  return {
    fetch: (async () => Response.json({ ok: true })) as typeof fetch,
    issueSession: async () => session,
    refreshSession: async () => session,
  };
}

test("requires a verified context for this specific app and a test-only backend", async () => {
  for (const context of [{}, { ...identity, APPID: "wx0000000000000000" }]) {
    const response = await handleGateway(post, context, env);
    assert.equal(response.statusCode, 401);
  }
  for (const overrides of [{ APP_ENVIRONMENT: "production" }, { SHUOKAI_BACKEND_URL: "https://attacker.test" }]) {
    assert.equal((await handleGateway(post, identity, { ...env, ...overrides })).statusCode, 503);
  }
});

test("login ignores forged identity in event data and uses native verified identity", async () => {
  const deps = dependencies();
  deps.issueSession = async (...args: Parameters<typeof import("../../server/wechat-session.ts").issueWechatSession>) => {
    assert.deepEqual(args[1], { openid: identity.OPENID, unionid: identity.UNIONID });
    assert.equal(args[0].secretKey, env.SUPABASE_SECRET_KEY);
    return session;
  };
  const response = await handleGateway({ path: "/wechat-login", method: "POST", data: { openid: "victim", APPID: "forged", code: "forged" } }, identity, env, deps);
  assert.deepEqual(response, { statusCode: 200, data: session });
});

test("refresh is supported without a WeChat AppSecret and never reissues identity from the body", async () => {
  const deps = dependencies();
  deps.refreshSession = async (...args: Parameters<typeof import("../../server/wechat-session.ts").refreshWechatSession>) => {
    assert.equal(args[1], "old-refresh");
    return session;
  };
  const response = await handleGateway({ path: "/wechat-login", method: "POST", data: { refreshToken: "old-refresh" } }, identity, env, deps);
  assert.equal(response.statusCode, 200);
  const rejected = await handleGateway({ path: "/wechat-login", method: "POST", data: { refreshToken: {} } }, identity, env, deps);
  assert.equal(rejected.statusCode, 400);
});

test("refuses missing auth, arbitrary URLs, path traversal and unsupported methods", async () => {
  assert.equal((await handleGateway({ ...post, authorization: undefined }, identity, env)).statusCode, 401);
  for (const path of ["https://attacker.test", "//attacker.test", "/../wechat-login", "/miniapp-api?redirect=evil"]) {
    assert.equal((await handleGateway({ ...post, path }, identity, env)).statusCode, 404);
  }
  assert.equal((await handleGateway({ ...post, method: "DELETE" }, identity, env)).statusCode, 400);
});

test("forwards only the user JWT to a fixed backend and preserves the authorization error", async () => {
  const deps = dependencies();
  deps.fetch = async (url, options) => {
    assert.equal(url, `${env.SHUOKAI_BACKEND_URL}/miniapp-api`);
    assert.deepEqual(options?.headers, { authorization: "Bearer jwt", "content-type": "application/json" });
    assert.equal(options?.body, JSON.stringify(post.data));
    assert.equal(options?.redirect, "error");
    return Response.json({ code: "AUTH_SESSION_EXPIRED", message: "登录已失效。" }, { status: 401 });
  };
  const response = await handleGateway({ ...post, headers: { apikey: "forged-admin-key" } }, identity, env, deps);
  assert.equal(response.statusCode, 401);
  assert.equal((response.data as { code: string }).code, "AUTH_SESSION_EXPIRED");
});

test("transcription carries bounded MP3 bytes as multipart and never uploads to public storage", async () => {
  const deps = dependencies();
  deps.fetch = async (_url, options) => {
    assert.ok(options?.body instanceof FormData);
    const audio = options.body.get("file");
    assert.ok(audio instanceof File);
    assert.equal(audio.name, "recording.mp3");
    assert.equal(await audio.text(), "audio");
    return Response.json({ text: "原话" });
  };
  assert.equal((await handleGateway({ ...post, path: "/transcribe", data: { audioBase64: "YXVkaW8=" } }, identity, env, deps)).statusCode, 200);
  assert.equal((await handleGateway({ ...post, path: "/transcribe", data: { audioBase64: "%%%=" } }, identity, env, deps)).statusCode, 400);
  assert.equal((await handleGateway({ ...post, path: "/transcribe", data: { audioBase64: "A".repeat(4 * 1024 * 1024 + 4) } }, identity, env, deps)).statusCode, 413);
});

test("bounds JSON requests and responses", async () => {
  assert.equal((await handleGateway({ ...post, data: { text: "x".repeat(256 * 1024) } }, identity, env)).statusCode, 413);
  const deps = dependencies();
  deps.fetch = async () => new Response("x".repeat(1024 * 1024 + 1));
  assert.equal((await handleGateway(post, identity, env, deps)).statusCode, 502);
});

test("does not leak upstream exceptions or secrets, and exposes stable login failures", async () => {
  const deps = dependencies();
  deps.fetch = async () => { throw new Error("secret-token-private-text"); };
  const response = await handleGateway(post, identity, env, deps);
  assert.equal(response.statusCode, 502);
  assert.ok(!JSON.stringify(response).includes("secret-token"));
  deps.issueSession = async () => { throw new WechatSessionError("WECHAT_MAPPING_FAILED", "微信身份映射读取失败。", 500); };
  const login = await handleGateway({ path: "/wechat-login", method: "POST", data: {} }, identity, env, deps);
  assert.equal((login.data as { code: string }).code, "WECHAT_MAPPING_FAILED");
});
