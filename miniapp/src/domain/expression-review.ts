export function expressionReviewIsSummary(step: number, fieldCount: number) {
  return step >= Math.max(0, fieldCount);
}

export function expressionReviewSummaryStep(fieldCount: number) {
  return Math.max(0, fieldCount);
}

export function shouldResumeExpressionClarification(question: string) {
  return Boolean(question.trim());
}
