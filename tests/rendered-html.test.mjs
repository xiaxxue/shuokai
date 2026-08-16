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
  assert.match(page, /有些话/);
  assert.match(page, /理解，不必同意/);
  assert.match(page, /H5 正式版打磨中/);
  assert.match(page, /看看说开怎么工作/);
  assert.doesNotMatch(page, /https:\/\/app\.shuokai\.me/);
  assert.doesNotMatch(page, /开始一次说开|进入 H5 正式版/);
  assert.doesNotMatch(page, /shuokai-supabase-test\.shuokai\.workers\.dev/);
  assert.doesNotMatch(page, /simulate_partner|demo|mock|演示|模拟/iu);
  assert.match(mechanism, /各自表达/);
  assert.match(mechanism, /本人确认/);
  assert.match(mechanism, /共同理解/);
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
