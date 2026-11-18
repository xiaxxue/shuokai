import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createTestHarness } from "wrangler";

test("OpenCode request options work in Workers and never follow provider redirects", async () => {
  const production = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  const previousLogSetting = process.env.WRANGLER_WRITE_LOGS;
  process.env.WRANGLER_WRITE_LOGS = "false";
  const server = createTestHarness({ workers: [{ config: {
    name: "shuokai-opencode-runtime-test",
    main: fileURLToPath(new URL("./fixtures/opencode-runtime.ts", import.meta.url)),
    compatibility_date: production.compatibility_date,
    compatibility_flags: production.compatibility_flags,
  } }] });
  try {
    await server.listen();
    for (const status of [200, 302, 307]) {
      const response = await server.fetch(`https://runtime-test.invalid/?status=${status}`);
      const result = await response.json();
      assert.deepEqual(result, status === 200
        ? { ok: true, calls: 1, redirect: "manual" }
        : { ok: false, code: "OPENCODE_AI_REQUEST_FAILED", calls: 1, redirect: "manual" });
    }
  } finally {
    await server.close();
    if (previousLogSetting === undefined) delete process.env.WRANGLER_WRITE_LOGS;
    else process.env.WRANGLER_WRITE_LOGS = previousLogSetting;
  }
});
