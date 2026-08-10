import assert from "node:assert/strict";
import test from "node:test";
import {
  getSupabaseKeys,
  readNamedKey,
} from "../../supabase/functions/_shared/supabase-keys.ts";

test("Edge Functions read modern default publishable and secret keys", () => {
  const environment: Record<string, string> = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: "sb_publishable_test" }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test" }),
  };
  assert.deepEqual(getSupabaseKeys((name) => environment[name]), {
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_test",
    secretKey: "sb_secret_test",
  });
});

test("Edge Functions reject malformed or unnamed key dictionaries", () => {
  assert.equal(readNamedKey("not-json"), null);
  assert.equal(readNamedKey(JSON.stringify([])), null);
  assert.equal(readNamedKey(JSON.stringify({ other: "sb_publishable_other" })), null);
  assert.equal(readNamedKey(JSON.stringify({ default: "" })), null);
});
