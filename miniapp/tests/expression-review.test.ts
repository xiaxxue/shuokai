import { describe, expect, it } from "vitest";
import {
  expressionReviewIsSummary,
  expressionReviewSummaryStep,
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
});
