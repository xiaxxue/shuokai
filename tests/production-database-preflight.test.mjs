import assert from "node:assert/strict";
import test from "node:test";
import { checkProductionDatabase } from "../scripts/check-production-database.mjs";

const config = { supabaseUrl: "https://production-ref.supabase.co", supabasePublishableKey: "sb_publishable_test" };

test("production preflight confirms required RPCs exist and deny anonymous execution", async () => {
  const names = [];
  await checkProductionDatabase({ ...config, async request(url, init) {
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.apikey, config.supabasePublishableKey);
    assert.equal(init.headers.authorization, undefined);
    assert.equal(JSON.parse(init.body).p_room_id, "00000000-0000-4000-8000-000000000000");
    const name = new URL(url).pathname.split("/").at(-1);
    names.push(name);
    return Response.json({ code: "42501", message: `permission denied for function ${name}` }, { status: 401 });
  } });
  assert.deepEqual(names, ["get_ai_memory_context_v3", "get_room_relationship_context_v3"]);
});

test("missing production migration blocks deployment", async () => {
  await assert.rejects(checkProductionDatabase({ ...config, async request() {
    return Response.json({ code: "PGRST202" }, { status: 404 });
  } }), /请先应用主分支 migration/);
});

test("anonymous access and unrelated authentication errors cannot pass the preflight", async () => {
  for (const [status, body] of [[200, {}], [401, { code: "PGRST301" }],
    [401, { code: "42501", message: "permission denied for schema private" }]]) {
    await assert.rejects(checkProductionDatabase({ ...config, async request() {
      return Response.json(body, { status });
    } }), /匿名隔离未通过/);
  }
});

test("transport errors stop deployment without disclosing internal details", async () => {
  await assert.rejects(checkProductionDatabase({ ...config, async request() {
    throw new Error("private transport detail");
  } }), { message: "无法检查正式数据库函数 get_ai_memory_context_v3；发布已停止，请检查数据库连接。" });
});
