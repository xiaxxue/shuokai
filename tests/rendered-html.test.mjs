import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("routes the retired web surface to the real H5 client", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /说开 SHUOKAI/);
  assert.match(page, /redirect\(productUrl\)/);
  assert.match(page, /shuokai-supabase-test\.shuokai\.workers\.dev/);
  assert.doesNotMatch(page, /simulate_partner|demo|mock|演示|模拟/iu);
});

test("keeps privacy, RLS, and deploy configuration explicit", async () => {
  const [layout, packageJson, migration, hosting, worker] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260806053428_migrate_from_d1_to_supabase.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../cloudflare/src/handlers.ts", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /说开 SHUOKAI/);
  assert.match(migration, /'rawDraftVisibility', 'owner_only'/);
  assert.match(migration, /'sharedContentRule', 'approved_perspectives_only'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /security definer/);
  assert.match(hosting, /"d1": null/);
  assert.match(worker, /auth\.getClaims/);
  assert.match(packageJson, /@supabase\/supabase-js/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
