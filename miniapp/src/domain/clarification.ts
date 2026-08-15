// A safety/rate boundary, not a product promise. The conversation ends when the
// expression is sufficiently complete, not when a visible turn quota is met.
export const MAX_CLARIFICATION_TURNS = 8;
export const MAX_CLARIFICATION_ANSWER_LENGTH = 1200;

const PRIVATE_CONTEXT_MARKER = "\n\n<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>\n";

export type ClarificationTurn = {
  question: string;
  answer: string;
};

export const discoveryDimensions = ["event", "impact", "intention"] as const;
export type DiscoveryDimension = typeof discoveryDimensions[number];

export type DiscoveryUnderstandingState = {
  coverage: Record<DiscoveryDimension, {
    status: "ENOUGH" | "MISSING";
    evidence: string[];
    missingInfo: string;
  }>;
  latestAnswerUpdate: {
    absorbed: boolean;
    updatedDimensions: DiscoveryDimension[];
  };
  nextQuestion: {
    focusDimension: DiscoveryDimension | "none";
    text: string;
    purpose: string;
  };
};

export type ClarificationMessage = {
  role: "assistant" | "user";
  kind: "message" | "typing";
  content: string;
};

type ClarificationExpression = {
  fields: Readonly<Record<string, string>>;
};

type ClarificationField = {
  key: string;
  label: string;
  prompt: string;
  optional?: boolean;
};

const optionalClarificationPrompts = [
  "这件事里，还有哪个具体细节会影响别人准确理解你的感受？",
  "现在这张表达卡里，哪一部分还不像你真正想说的话？",
  "如果对方只记住一件事，你最希望对方理解什么？",
] as const;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

export function parseDiscoveryUnderstandingState(value: unknown): DiscoveryUnderstandingState | null {
  if (!isRecord(value) || !isRecord(value.coverage) ||
    !hasExactKeys(value.coverage, discoveryDimensions) ||
    !isRecord(value.latestAnswerUpdate) ||
    !hasExactKeys(value.latestAnswerUpdate, ["absorbed", "updatedDimensions"]) ||
    typeof value.latestAnswerUpdate.absorbed !== "boolean" ||
    !Array.isArray(value.latestAnswerUpdate.updatedDimensions) ||
    value.latestAnswerUpdate.updatedDimensions.length > 3 ||
    new Set(value.latestAnswerUpdate.updatedDimensions).size !==
      value.latestAnswerUpdate.updatedDimensions.length ||
    !value.latestAnswerUpdate.updatedDimensions.every((item) =>
      discoveryDimensions.includes(item as DiscoveryDimension)) ||
    !isRecord(value.nextQuestion) ||
    !hasExactKeys(value.nextQuestion, ["focusDimension", "text", "purpose"]) ||
    ![...discoveryDimensions, "none"].includes(String(value.nextQuestion.focusDimension)) ||
    typeof value.nextQuestion.text !== "string" || value.nextQuestion.text.length > 500 ||
    typeof value.nextQuestion.purpose !== "string" || value.nextQuestion.purpose.length > 300) return null;

  const coverage = {} as DiscoveryUnderstandingState["coverage"];
  for (const dimension of discoveryDimensions) {
    const item = value.coverage[dimension];
    if (!isRecord(item) || !hasExactKeys(item, ["status", "evidence", "missingInfo"]) ||
      (item.status !== "ENOUGH" && item.status !== "MISSING") ||
      !Array.isArray(item.evidence) || item.evidence.length > 3 ||
      !item.evidence.every((evidence) =>
        typeof evidence === "string" && Boolean(evidence.trim()) && evidence.length <= 240) ||
      typeof item.missingInfo !== "string" || item.missingInfo.length > 300 ||
      (item.status === "ENOUGH" && (!item.evidence.length || item.missingInfo.trim())) ||
      (item.status === "MISSING" && !item.missingInfo.trim())) return null;
    coverage[dimension] = {
      status: item.status,
      evidence: item.evidence,
      missingInfo: item.missingInfo,
    };
  }

  return {
    coverage,
    latestAnswerUpdate: {
      absorbed: value.latestAnswerUpdate.absorbed,
      updatedDimensions: value.latestAnswerUpdate.updatedDimensions as DiscoveryDimension[],
    },
    nextQuestion: {
      focusDimension: value.nextQuestion.focusDimension as DiscoveryDimension | "none",
      text: value.nextQuestion.text,
      purpose: value.nextQuestion.purpose,
    },
  };
}

function normalizedQuestion(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\p{P}\p{S}\s]/gu, "");
}

export function isRepeatedDiscoveryQuestion(
  question: string,
  turns: readonly ClarificationTurn[],
) {
  const candidate = normalizedQuestion(question);
  return Boolean(candidate) && turns.some((turn) => normalizedQuestion(turn.question) === candidate);
}

export function sanitizeClarificationTurns(value: unknown): ClarificationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CLARIFICATION_TURNS).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Partial<ClarificationTurn>;
    const question = cleanText(candidate.question, 500);
    const answer = cleanText(candidate.answer, MAX_CLARIFICATION_ANSWER_LENGTH);
    return question && answer ? [{ question, answer }] : [];
  });
}

export function nextClarificationQuestion(
  uncertainties: readonly string[],
  turns: readonly ClarificationTurn[],
) {
  if (turns.length >= MAX_CLARIFICATION_TURNS) return "";
  const answered = new Set(turns.map((turn) => turn.question.trim()));
  return uncertainties
    .map((item) => item.trim())
    .find((item) => item && !answered.has(item)) ?? "";
}

export function optionalClarificationQuestion(turns: readonly ClarificationTurn[]) {
  if (turns.length >= MAX_CLARIFICATION_TURNS) return "";
  return optionalClarificationPrompts[turns.length] ?? "";
}

export function expressionCandidateClarificationQuestion(
  uncertainties: readonly string[],
  turns: readonly ClarificationTurn[],
  expression?: ClarificationExpression,
  fields: readonly ClarificationField[] = [],
) {
  return nextClarificationQuestion(uncertainties, turns) ||
    nextMissingFieldQuestion(expression, fields, turns) ||
    (turns.length === 0 ? optionalClarificationQuestion(turns) : "");
}

export function nextMissingFieldQuestion(
  expression: ClarificationExpression | undefined,
  fields: readonly ClarificationField[],
  turns: readonly ClarificationTurn[],
) {
  if (!expression || turns.length >= MAX_CLARIFICATION_TURNS) return "";
  const answered = new Set(turns.map((turn) => turn.question.trim()));
  return fields.flatMap((field) => {
    if (field.optional || expression.fields[field.key]?.trim()) return [];
    const question = `表达卡的「${field.label}」还没有补全。${field.prompt}`;
    return answered.has(question) ? [] : [question];
  })[0] ?? "";
}

export function clarificationConversationMessages(
  turns: readonly ClarificationTurn[],
  currentQuestion: string,
  busy: boolean,
): ClarificationMessage[] {
  const messages: ClarificationMessage[] = sanitizeClarificationTurns(turns).flatMap((turn) => [
    { role: "assistant", kind: "message", content: turn.question } as const,
    { role: "user", kind: "message", content: turn.answer } as const,
  ]);
  if (busy) {
    messages.push({ role: "assistant", kind: "typing", content: "" });
    return messages;
  }
  const question = cleanText(currentQuestion, 500);
  if (question) messages.push({ role: "assistant", kind: "message", content: question });
  return messages;
}

export function shouldPreserveDraftOnAiExit(
  fields: Readonly<Record<string, string>>,
  turns: readonly ClarificationTurn[],
) {
  return turns.length > 0 || Object.values(fields).some((value) => value.trim());
}

export function composeClarificationSource(
  sourceText: string,
  turns: readonly ClarificationTurn[],
) {
  const base = sourceText.trim();
  const sanitizedTurns = sanitizeClarificationTurns(turns);
  if (!sanitizedTurns.length) return base;
  const privateContext = JSON.stringify({
    note: "以下问答是用户为 AI 私密整理补充的背景，不是已经核实的事实，也不得直接分享给对方。",
    privateClarifications: sanitizedTurns,
  });
  const composed = `${base}${PRIVATE_CONTEXT_MARKER}${privateContext}`;
  if (composed.length > 12000) {
    throw new Error("原话和补充内容合计超过 12000 字，请先精简原话或回答。 ");
  }
  return composed;
}

export function parseClarificationSource(value: string) {
  const markerIndex = value.lastIndexOf(PRIVATE_CONTEXT_MARKER);
  if (markerIndex < 0) return { sourceText: value, turns: [] as ClarificationTurn[] };
  const sourceText = value.slice(0, markerIndex);
  try {
    const parsed = JSON.parse(value.slice(markerIndex + PRIVATE_CONTEXT_MARKER.length)) as {
      privateClarifications?: unknown;
    };
    return { sourceText, turns: sanitizeClarificationTurns(parsed.privateClarifications) };
  } catch {
    return { sourceText, turns: [] as ClarificationTurn[] };
  }
}
