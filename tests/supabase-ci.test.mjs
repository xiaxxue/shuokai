import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/supabase-db-tests.yml", import.meta.url);

const historicalMigrationAliases = new Map([
  ["20260813170908_add_guided_dialogue_rounds.sql", "20260813164533_add_guided_dialogue_rounds.sql"],
  ["20260815024214_require_mutual_understanding_loop.sql", "20260815023149_require_mutual_understanding_loop.sql"],
  ["20260815024950_restart_dialogue_after_reconfirmation.sql", "20260815024845_restart_dialogue_after_reconfirmation.sql"],
  ["20260815125349_ai_private_conversation_memory.sql", "20260815114637_ai_private_conversation_memory.sql"],
  ["20260815144559_persist_invitation_summary.sql", "20260815143000_persist_invitation_summary.sql"],
  ["20260815152232_persist_invitation_summary.sql", "20260815143000_persist_invitation_summary.sql"],
  ["20260815155754_prefetch_invitation_context.sql", "20260815153844_prefetch_invitation_context.sql"],
  ["20260816020355_allow_receiver_without_inviter_context.sql", "20260816013034_allow_receiver_without_inviter_context.sql"],
]);

test("database CI uses a locked local Supabase stack without project secrets", async () => {
  const [workflow, packageJson] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(packageJson, /"supabase": "2\.111\.0"/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /npx --no-install supabase db start/);
  assert.match(workflow, /npx --no-install supabase test db/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /npx --no-install supabase stop --no-backup/);
  assert.doesNotMatch(
    workflow,
    /SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|--linked|project-ref/i,
  );
});

test("historical remote migration aliases remain explicit no-ops", async () => {
  for (const [alias, canonical] of historicalMigrationAliases) {
    const [aliasSql, canonicalSql] = await Promise.all([
      readFile(new URL(`../supabase/migrations/${alias}`, import.meta.url), "utf8"),
      readFile(new URL(`../supabase/migrations/${canonical}`, import.meta.url), "utf8"),
    ]);

    assert.ok(canonicalSql.trim(), `${canonical} must contain the schema change`);
    assert.match(aliasSql, new RegExp(canonical.replaceAll(".", "\\.")));
    assert.equal(
      aliasSql.replace(/^\s*--.*$/gm, "").trim(),
      "",
      `${alias} must never replay schema SQL`,
    );
  }
});
