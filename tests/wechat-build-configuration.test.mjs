import test from "node:test";
import assert from "node:assert/strict";
import { validateWechatBuildConfiguration } from "../scripts/prepare-wechat-from-main.mjs";

const production = {
  environment: "production", appId: "wx30bafbe48a0f4d4b", cloudEnv: "cloud1-d5gdgrjjxcd112d5c",
  productionApproval: "wx30bafbe48a0f4d4b", productionProjectRef: "jmktnjeefvwailfcrljz",
};

test("production requires explicit approval and the exact production database", () => {
  const target = validateWechatBuildConfiguration(production);
  assert.equal(target.functionName, "shuokaiGatewayProduction");
  assert.equal(target.backend, "https://app.shuokai.me");
  assert.equal(target.supabaseUrl, "https://jmktnjeefvwailfcrljz.supabase.co");
  for (const overrides of [
    { productionApproval: undefined }, { productionProjectRef: "pwpcisztfnukjnavszgv" },
    { appId: "wx0000000000000000", productionApproval: "wx0000000000000000" },
  ]) assert.throws(() => validateWechatBuildConfiguration({ ...production, ...overrides }), /正式微信交付/);
});

test("test and production use separate functions and reject incomplete or unknown targets", () => {
  const target = validateWechatBuildConfiguration({ ...production, environment: "test", productionApproval: undefined });
  assert.equal(target.functionName, "shuokaiGateway");
  assert.equal(target.backend, "https://shuokai-supabase-test.shuokai.workers.dev");
  assert.equal(target.supabaseUrl, "https://pwpcisztfnukjnavszgv.supabase.co");
  for (const overrides of [{ environment: "staging" }, { cloudEnv: "" }, { appId: "" }]) {
    assert.throws(() => validateWechatBuildConfiguration({ ...production, ...overrides }));
  }
});
