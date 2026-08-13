import type { EditableExpression } from "./expression";

export type InvitationContext = {
  inviterName: string;
  topic: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

export function parseInvitationContext(value: unknown): InvitationContext {
  if (!isRecord(value)) throw new Error("邀请说明格式无效，请稍后重试。");
  const inviterName = boundedText(value.inviterName, 60);
  const topic = boundedText(value.topic, 180);
  if (!inviterName) throw new Error("邀请说明格式无效，请稍后重试。");
  return { inviterName, topic };
}

export function topicFromEditableExpression(expression: EditableExpression) {
  const key = expression.mode === "NVC"
    ? "observation"
    : expression.mode === "FACT_DISPUTE"
      ? "claim"
      : expression.mode === "BOUNDARY"
        ? "boundary"
        : "";
  return key ? boundedText(expression.fields[key], 180) : "";
}

export function invitationClarificationMessage(context: InvitationContext | null, roomCode: string) {
  const topic = context?.topic
    ? `我看到的主题是“${context.topic}”，但我还不确定你具体指哪一段。`
    : "我还不确定你具体指的是哪件事。";
  return `我收到了“说开”房间 ${roomCode} 的邀请。${topic}你可以补充一下发生时间、场景或具体行为吗？`;
}
