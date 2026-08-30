import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("presents the official site honestly while the production H5 is still being refined", async () => {
  const [page, layout, authPanel, mechanism] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../miniapp/src/components/H5AuthPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../app/components/dialogue-mechanism.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /说开 SHUOKAI/);
  assert.match(layout, /resolveOrigin/);
  assert.match(layout, /https:\/\/shuokai\.me/);
  assert.match(page, /聊不明白的时候/);
  assert.match(page, /理解，不必同意/);
  assert.match(page, /观察 · 感受 · 需要 · 请求/);
  assert.match(page, /共同理解地图/);
  assert.match(mechanism, /每个问题，先留下一个局部结果/);
  assert.match(page, /完整产品蓝图/);
  assert.match(page, /当前 H5 已覆盖/);
  assert.match(page, /H5 入口/);
  assert.match(page, /打开说开 H5/);
  assert.match(page, /当前仍在打磨；部署完成后，此入口将直接可用/);
  assert.match(page, /查看完整产品流程/);
  assert.match(page, /https:\/\/app\.shuokai\.me/);
  assert.match(page, /target="_blank"/);
  assert.doesNotMatch(page, /开始一次说开|进入 H5 正式版/);
  assert.doesNotMatch(page, /shuokai-supabase-test\.shuokai\.workers\.dev/);
  assert.doesNotMatch(page, /simulate_partner|demo|mock|演示|模拟/iu);
  assert.match(mechanism, /私密整理/);
  assert.match(mechanism, /表达卡/);
  assert.match(mechanism, /理解地图/);
  assert.match(mechanism, /逐题聊开/);
  assert.match(mechanism, /行动与复盘/);
  assert.match(mechanism, /能做到/);
  assert.match(mechanism, /不能做到/);
  assert.match(mechanism, /aria-pressed/);
  assert.match(authPanel, /创建账号/);
  assert.doesNotMatch(authPanel, /测试账号|demo|mock|演示|模拟/iu);
});

test("keeps privacy, RLS, and deploy configuration explicit", async () => {
  const [layout, packageJson, migration, hosting, worker, supabaseConfig] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260806053428_migrate_from_d1_to_supabase.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../cloudflare/src/handlers.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /说开 SHUOKAI/);
  assert.match(migration, /'rawDraftVisibility', 'owner_only'/);
  assert.match(migration, /'sharedContentRule', 'approved_perspectives_only'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /security definer/);
  assert.match(hosting, /"d1": null/);
  assert.match(worker, /auth\.getClaims/);
  assert.match(supabaseConfig, /enable_anonymous_sign_ins = false/);
  assert.match(packageJson, /@supabase\/supabase-js/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
