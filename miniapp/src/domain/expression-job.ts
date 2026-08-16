export type TerminalExpressionJobStatus = "FAILED_FINAL" | "STALE" | "CANCELED";

export function expressionJobFailureMessage(
  status: TerminalExpressionJobStatus,
  errorCode: string | null,
) {
  if (status === "STALE") {
    return "草稿在 AI 整理期间发生了变化，请重新更新。";
  }
  if (status === "CANCELED") {
    return "这次 AI 整理已取消，请重新更新。";
  }
  if (errorCode === "CLOUDFLARE_AI_QUOTA_EXHAUSTED") {
    return "AI 今日可用额度已用完，请直接修改卡片。";
  }
  if (errorCode === "AI_SERVICE_NOT_CONFIGURED" || errorCode === "CLOUDFLARE_AI_NOT_CONFIGURED") {
    return "AI 整理服务暂时不可用，请直接修改卡片。";
  }
  if (errorCode === "CLOUDFLARE_AI_INVALID_OUTPUT") {
    return "AI 返回的内容没有通过校验，请重新更新或直接修改卡片。";
  }
  return "AI 这次没有完成整理，请重新更新或直接修改卡片。";
}
