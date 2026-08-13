import { describe, expect, it } from "vitest";
import {
  expressionReviewIsSummary,
  nextExpressionReviewStep,
  previousExpressionReviewStep,
} from "../src/domain/expression-review";

describe("expression card review navigation", () => {
  it("reviews one card at a time before reaching the share summary", () => {
    let step = 0;
    for (let index = 0; index < 4; index += 1) {
      expect(expressionReviewIsSummary(step, 4)).toBe(false);
      step = nextExpressionReviewStep(step, 4);
    }
    expect(step).toBe(4);
    expect(expressionReviewIsSummary(step, 4)).toBe(true);
  });

  it("moves back from the summary without going before the first card", () => {
    expect(previousExpressionReviewStep(4)).toBe(3);
    expect(previousExpressionReviewStep(0)).toBe(0);
  });
});
