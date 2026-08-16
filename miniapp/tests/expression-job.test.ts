import { describe, expect, it } from "vitest";
import { expressionJobFailureMessage } from "../src/domain/expression-job";

describe("expression AI job failures", () => {
  it("explains that a stale result did not overwrite the newer draft", () => {
    expect(expressionJobFailureMessage("STALE", null)).toBe(
      "草稿在 AI 整理期间发生了变化，请重新更新。",
    );
  });

  it("gives a next step for canceled and final failures", () => {
    expect(expressionJobFailureMessage("CANCELED", null)).toBe(
      "这次 AI 整理已取消，请重新更新。",
    );
    expect(expressionJobFailureMessage("FAILED_FINAL", "INVALID_JOB_INPUT")).toBe(
      "AI 这次没有完成整理，请重新更新或直接修改卡片。",
    );
  });

  it("does not suggest retrying when the daily AI quota is exhausted", () => {
    expect(expressionJobFailureMessage("FAILED_FINAL", "CLOUDFLARE_AI_QUOTA_EXHAUSTED")).toBe(
      "AI 今日可用额度已用完，请直接修改卡片。",
    );
  });
});
