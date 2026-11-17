import assert from "node:assert/strict";
import { test } from "node:test";
import { issueWechatSession, refreshWechatSession } from "../../server/wechat-session.ts";

const config = { url: "https://project.supabase.co", publishableKey: "sb_publishable_test", secretKey: "sb_secret_test" };
const user = { id: "11111111-1111-4111-8111-111111111111", email: "mapped@users.shuokai.invalid", aud: "authenticated", role: "authenticated" };
const authSession = { access_token: "issued-jwt", refresh_token: "issued-refresh", token_type: "bearer", expires_in: 3600, expires_at: 9999999999, user };

test("existing WeChat identity receives a regular Supabase user session, never the admin credential", async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, options: RequestInit) => {
    const path = new URL(input).pathname;
    paths.push(path);
    const headers = new Headers(options.headers);
    if (path.startsWith("/rest/") || path.startsWith("/auth/v1/admin/")) assert.equal(headers.get("apikey"), config.secretKey);
    if (path.endsWith("internal_get_wechat_user")) {
      assert.deepEqual(JSON.parse(options.body as string), { p_openid: "verified-openid" });
      return Response.json(user.id);
    }
    if (path.endsWith(`/users/${user.id}`)) return Response.json(user);
    if (path.endsWith("generate_link")) return Response.json({ ...user, hashed_token: "one-time-hash", verification_type: "magiclink" });
    if (path.endsWith("verify")) {
      assert.equal(headers.get("apikey"), config.publishableKey);
      return Response.json(authSession);
    }
    throw new Error(`Unexpected auth endpoint ${path}`);
  });
  const result = await issueWechatSession(config, { openid: "verified-openid" });
  assert.deepEqual(result, { accessToken: "issued-jwt", refreshToken: "issued-refresh", expiresAt: 9999999999, userId: user.id });
  assert.ok(!JSON.stringify(result).includes(config.secretKey));
  assert.ok(!paths.some(path => path.endsWith("/admin/users")));
});

test("new WeChat identity is bound before a user session is issued", async (t) => {
  let bound = false;
  t.mock.method(globalThis, "fetch", async (input: string, options: RequestInit) => {
    const path = new URL(input).pathname;
    if (path.endsWith("internal_get_wechat_user")) return Response.json(null);
    if (path.endsWith("/admin/users")) return Response.json(user);
    if (path.endsWith("internal_bind_wechat_user")) {
      const body = JSON.parse(options.body as string);
      assert.equal(body.p_openid, "verified-openid");
      assert.equal(body.p_user_id, user.id);
      bound = true;
      return Response.json(user.id);
    }
    if (path.endsWith("generate_link")) {
      assert.equal(bound, true);
      return Response.json({ ...user, hashed_token: "hash" });
    }
    if (path.endsWith("verify")) return Response.json(authSession);
    throw new Error(`Unexpected auth endpoint ${path}`);
  });
  assert.equal((await issueWechatSession(config, { openid: "verified-openid" })).userId, user.id);
});

test("missing identity migration fails closed without creating a user", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return Response.json({ message: "private database internals", code: "PGRST202" }, { status: 404 });
  });
  await assert.rejects(issueWechatSession(config, { openid: "verified-openid" }), { code: "WECHAT_MAPPING_FAILED" });
  assert.equal(requests, 1);
});

test("session refresh uses only the publishable key and rejects invalid refresh tokens", async (t) => {
  t.mock.method(globalThis, "fetch", async (_input: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get("apikey"), config.publishableKey);
    assert.deepEqual(JSON.parse(options.body as string), { refresh_token: "expired-token" });
    return Response.json({ msg: "expired", error_code: "refresh_token_not_found" }, { status: 400 });
  });
  await assert.rejects(refreshWechatSession(config, "expired-token"), { code: "WECHAT_SESSION_EXPIRED" });
});
