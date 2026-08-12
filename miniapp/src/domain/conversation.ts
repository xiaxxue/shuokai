import type { EditableExpression } from "./expression";

export const MAX_CONVERSATION_TURNS = 80;
export const MAX_CONVERSATION_MESSAGE_LENGTH = 1200;
export const MAX_CONVERSATION_SOURCE_LENGTH = 12000;

const CONVERSATION_SOURCE_MARKER = "<<<SHUOKAI_PRIVATE_CONVERSATION_V1>>>";

export type ConversationTurn = {
  id: string;
  role: "USER" | "AI";
  kind: "OPENING" | "USER_INPUT" | "QUESTION" | "ACKNOWLEDGEMENT";
  text: string;
  supportingText?: string;
};

export type ConversationReply = Pick<ConversationTurn, "kind" | "text" | "supportingText">;
export type ConversationSourceStage = "CONVERSATION" | "FINAL";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function createTurnId(index: number) {
  return `private-turn-${index + 1}`;
}

export function createPrivateConversation(): ConversationTurn[] {
  return [{
    id: createTurnId(0),
    role: "AI",
    kind: "OPENING",
    text: "这次想聊什么？",
  }];
}

export function appendConversationTurn(
  turns: readonly ConversationTurn[],
  turn: Omit<ConversationTurn, "id">,
) {
  if (turns.length >= MAX_CONVERSATION_TURNS) {
    throw new Error("这段私人对话已经很长了，可以先整理当前内容，再决定是否继续补充。 ");
  }
  const rawText = typeof turn.text === "string" ? turn.text.trim() : "";
  if (rawText.length > MAX_CONVERSATION_MESSAGE_LENGTH) {
    throw new Error("这一段超过 1200 字，请分成两段发送，原文不会被截断。 ");
  }
  const text = cleanText(rawText, MAX_CONVERSATION_MESSAGE_LENGTH);
  if (!text) throw new Error("请先写下这一段想说的话。 ");
  const supportingText = cleanText(turn.supportingText, 300);
  return [...turns, {
    ...turn,
    id: createTurnId(turns.length),
    text,
    ...(supportingText ? { supportingText } : {}),
  }];
}

export function sanitizeConversationTurns(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return createPrivateConversation();
  const sanitized = value.slice(0, MAX_CONVERSATION_TURNS).flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Partial<ConversationTurn>;
    if (candidate.role !== "USER" && candidate.role !== "AI") return [];
    if (!["OPENING", "USER_INPUT", "QUESTION", "ACKNOWLEDGEMENT"].includes(candidate.kind ?? "")) {
      return [];
    }
    const text = cleanText(candidate.text, MAX_CONVERSATION_MESSAGE_LENGTH);
    if (!text) return [];
    const supportingText = cleanText(candidate.supportingText, 300);
    return [{
      id: createTurnId(index),
      role: candidate.role,
      kind: candidate.kind as ConversationTurn["kind"],
      text,
      ...(supportingText ? { supportingText } : {}),
    }];
  });
  return sanitized.some((turn) => turn.kind === "OPENING")
    ? sanitized
    : [...createPrivateConversation(), ...sanitized.map((turn, index) => ({
      ...turn,
      id: createTurnId(index + 1),
    }))];
}

export function conversationUserTurns(turns: readonly ConversationTurn[]) {
  return turns.filter((turn) => turn.role === "USER" && turn.kind === "USER_INPUT");
}

export function conversationTranscript(turns: readonly ConversationTurn[]) {
  return conversationUserTurns(turns).map((turn) => turn.text).join("\n\n");
}

export function conversationFromLegacyText(value: string) {
  const source = value.trim();
  if (!source) return createPrivateConversation();
  let turns = createPrivateConversation();
  for (let offset = 0; offset < source.length; offset += MAX_CONVERSATION_MESSAGE_LENGTH) {
    turns = appendConversationTurn(turns, {
      role: "USER",
      kind: "USER_INPUT",
      text: source.slice(offset, offset + MAX_CONVERSATION_MESSAGE_LENGTH),
    });
  }
  return turns;
}

export function composeConversationSource(
  turns: readonly ConversationTurn[],
  stage: ConversationSourceStage = "CONVERSATION",
) {
  const privateTurns = turns.flatMap((turn) => {
    if (turn.role === "USER" && turn.kind === "USER_INPUT") {
      return [{ role: "USER", text: turn.text }];
    }
    if (turn.role === "AI" && turn.kind === "QUESTION") {
      return [{ role: "AI_QUESTION", text: turn.text }];
    }
    return [];
  });
  if (!privateTurns.some((turn) => turn.role === "USER")) {
    throw new Error("请先写下这次想聊的内容。 ");
  }
  const source = `${CONVERSATION_SOURCE_MARKER}\n${JSON.stringify({
    note: "这是用户与 AI 的私人对话。只有 USER 是用户原话；AI_QUESTION 仅用于理解紧随其后的回答，不能当作用户事实。",
    stage,
    turns: privateTurns,
  })}`;
  if (source.length > MAX_CONVERSATION_SOURCE_LENGTH) {
    throw new Error("这段私人对话已接近 12000 字，请先整理当前内容。 ");
  }
  return source;
}

export function conversationSourceStage(value: string): ConversationSourceStage | null {
  const source = value.trim();
  if (!source.startsWith(CONVERSATION_SOURCE_MARKER)) return null;
  try {
    const parsed = JSON.parse(source.slice(CONVERSATION_SOURCE_MARKER.length).trim()) as {
      stage?: unknown;
    };
    return parsed.stage === "CONVERSATION" || parsed.stage === "FINAL" ? parsed.stage : null;
  } catch {
    return null;
  }
}

export function parseConversationSource(value: string) {
  const source = value.trim();
  if (!source.startsWith(CONVERSATION_SOURCE_MARKER)) {
    return conversationFromLegacyText(source);
  }
  try {
    const parsed = JSON.parse(source.slice(CONVERSATION_SOURCE_MARKER.length).trim()) as {
      turns?: unknown;
    };
    if (!Array.isArray(parsed.turns)) return createPrivateConversation();
    let turns = createPrivateConversation();
    for (const item of parsed.turns.slice(0, MAX_CONVERSATION_TURNS - 1)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const candidate = item as { role?: unknown; text?: unknown };
      const text = cleanText(candidate.text, MAX_CONVERSATION_MESSAGE_LENGTH);
      if (!text) continue;
      if (candidate.role === "USER") {
        turns = appendConversationTurn(turns, { role: "USER", kind: "USER_INPUT", text });
      } else if (candidate.role === "AI_QUESTION") {
        turns = appendConversationTurn(turns, {
          role: "AI",
          kind: "QUESTION",
          text,
          supportingText: "为了不替你补全没有说过的部分，我只确认这一件事。",
        });
      }
    }
    return turns;
  } catch {
    return createPrivateConversation();
  }
}

export function conversationReplyFromCandidate(
  expression: EditableExpression,
  previousQuestions: readonly string[] = [],
): ConversationReply {
  const asked = new Set(previousQuestions.map((item) => item.trim()));
  const question = expression.uncertainties
    .map((item) => item.trim())
    .find((item) => item && !asked.has(item));
  if (question) {
    return {
      kind: "QUESTION",
      text: question,
      supportingText: "为了不替你补全没有说过的部分，我只确认这一件事。你也可以跳过，继续讲自己的。",
    };
  }
  return {
    kind: "ACKNOWLEDGEMENT",
    text: "这一段我先记下了。",
    supportingText: "你可以接着讲；等你觉得差不多了，再由你决定是否整理。",
  };
}
