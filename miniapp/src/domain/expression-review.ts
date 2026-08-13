export function expressionReviewIsSummary(step: number, fieldCount: number) {
  return step >= Math.max(0, fieldCount);
}

export function nextExpressionReviewStep(step: number, fieldCount: number) {
  return Math.min(Math.max(0, fieldCount), Math.max(0, step) + 1);
}

export function previousExpressionReviewStep(step: number) {
  return Math.max(0, step - 1);
}
