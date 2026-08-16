import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("presents the official site without exposing the shared test client", async () => {
  const [page, layout, authPanel] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../miniapp/src/components/H5AuthPanel.vue", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /说开 SHUOKAI/);
  assert.match(layout, /resolveOrigin/);
  assert.match(layout, /https:\/\/shuokai\.me/);
  assert.match(page, /有些话/);
  assert.match(page, /理解不等于同意/);
  assert.match(page, /产品内测中/);
  assert.match(page, /aria-disabled="true"/);
  assert.doesNotMatch(page, /shuokai-supabase-test\.shuokai\.workers\.dev/);
  assert.doesNotMatch(page, /simulate_partner|demo|mock|演示|模拟/iu);
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
