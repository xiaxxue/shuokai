import type { EditableExpression } from "./expression";

export type InvitationContext = {
  inviterName: string;
  topic: string;
  title: string;
  summary: string;
  generatedByAi: boolean;
};

export type InvitationContextStatus = "idle" | "loading" | "ready" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function withTerminalPunctuation(value: string) {
  return /[。！？!?]$/u.test(value) ? value : `${value}。`;
}

export function parseInvitationContext(value: unknown): InvitationContext {
  if (!isRecord(value)) throw new Error("邀请说明格式无效，请稍后重试。");
  const inviterName = boundedText(value.inviterName, 60);
  const topic = boundedText(value.topic, 180);
  const title = boundedText(value.title, 32) || "关于这次沟通";
  const summary = boundedText(value.summary, 220) || (topic
    ? `发起方确认的背景是：${topic}`
    : "发起方想邀请你先了解一件具体发生的事，再从你的视角讲讲当时的情况。");
  if (!inviterName) throw new Error("邀请说明格式无效，请稍后重试。");
  return { inviterName, topic, title, summary, generatedByAi: value.generatedByAi === true };
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

export function invitationContextFromEditableExpression(
  expression: EditableExpression,
  inviterName = "邀请你的人",
): InvitationContext {
  const topic = topicFromEditableExpression(expression);
  const title = expression.mode === "FACT_DISPUTE"
    ? "关于一件待核实的事"
    : expression.mode === "BOUNDARY"
      ? "关于需要被尊重的边界"
      : "关于这次具体经历";
  return {
    inviterName,
    topic,
    title,
    summary: topic
      ? `发起方确认的背景是：${withTerminalPunctuation(topic)}你可以先核对自己记得的时间、地点或场景、人物和经过，再讲你的版本。`
      : "请先确认一件具体发生的事，让受邀方知道这次沟通从哪里开始。",
    generatedByAi: false,
  };
}

export function invitationTopicCopy(status: InvitationContextStatus, topic: string) {
  const normalizedTopic = boundedText(topic, 180);
  if (status === "loading") return "正在读取这次沟通的主题…";
  if (status === "error") return "暂时没读到邀请说明";
  if (status === "ready" && normalizedTopic) return normalizedTopic;
  if (status === "ready") return "这次邀请暂未显示具体主题";
  return "正在准备这次沟通的主题…";
}

export function invitationTitleCopy(status: InvitationContextStatus, title: string) {
  if (status === "loading") return "正在理解这次想谈的事…";
  if (status === "error") return "暂时没读到邀请说明";
  return boundedText(title, 32) || "关于这次沟通";
}

export function invitationSummaryCopy(status: InvitationContextStatus, summary: string) {
  if (status === "loading") return "AI 正在从发起方已确认的内容中提取时间、地点或场景、人物和事件。";
  if (status === "error") return "可能是网络或同步问题，不代表发起方没有填写。你可以重新读取。";
  return boundedText(summary, 220) || "发起方想邀请你先了解一件具体发生的事，再讲讲你的版本。";
}

export function invitationClarificationMessage(context: InvitationContext | null, roomCode: string) {
  const topic = context?.title
    ? `我看到的主题是“${context.title}”，但我还不确定你具体指哪一段。`
    : "我还不确定你具体指的是哪件事。";
  return `我收到了“说开”房间 ${roomCode} 的邀请。${topic}你可以补充一下发生时间、场景或具体行为吗？`;
}
