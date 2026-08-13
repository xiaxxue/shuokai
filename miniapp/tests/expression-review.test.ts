import { describe, expect, it } from "vitest";
import {
  expressionReviewIsSummary,
  expressionReviewSummaryStep,
  shouldResumeExpressionClarification,
} from "../src/domain/expression-review";

describe("expression card review navigation", () => {
  it("opens the complete expression card for confirmation", () => {
    const step = expressionReviewSummaryStep(4);
    expect(step).toBe(4);
    expect(expressionReviewIsSummary(step, 4)).toBe(true);
  });

  it("keeps an empty expression review on its summary state", () => {
    expect(expressionReviewSummaryStep(0)).toBe(0);
    expect(expressionReviewIsSummary(0, 0)).toBe(true);
  });

  it("returns to AI for a pending question or an explicit extra turn", () => {
    expect(shouldResumeExpressionClarification("你还希望对方理解什么？", 1, 3)).toBe(true);
    expect(shouldResumeExpressionClarification("   ", 1, 3)).toBe(true);
    expect(shouldResumeExpressionClarification("   ", 3, 3)).toBe(false);
  });
});
