import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/supabase-db-tests.yml", import.meta.url);

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
