import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the 说开 product UI instead of starter content", async () => {
  const [prototype, layout] = await Promise.all([
    readFile(new URL("../app/SayOpenPrototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /说开 SHUOKAI/);
  assert.match(prototype, /理解，不必同意/);
  assert.match(prototype, /我想说开一件事/);
  assert.match(prototype, /ROOM_READY/);
  assert.doesNotMatch(prototype, /Your site is taking shape|Building your site/);
});

test("keeps product privacy and Supabase state-machine concepts explicit", async () => {
  const [prototype, layout, packageJson, migration, hosting, client] = await Promise.all([
    readFile(new URL("../app/SayOpenPrototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260806053218_migrate_from_d1_to_supabase.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8"),
  ]);

  assert.match(prototype, /私人内容默认不共享/);
  assert.match(prototype, /PERSPECTIVE_APPROVED/);
  assert.match(prototype, /REVIEWING_COMMON_VIEW/);
  assert.match(prototype, /AGREEMENT_ACTIVATED/);
  assert.match(prototype, /args: \(\) =>/);
  assert.match(prototype, /call\.args\(\)/);
  assert.match(layout, /说开 SHUOKAI/);
  assert.match(migration, /'rawDraftVisibility', 'owner_only'/);
  assert.match(migration, /'sharedContentRule', 'approved_perspectives_only'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /security definer/);
  assert.match(hosting, /"d1": null/);
  assert.match(client, /createClient/);
  assert.match(packageJson, /@supabase\/supabase-js/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
