export const MAX_CLARIFICATION_TURNS = 3;
export const MAX_CLARIFICATION_ANSWER_LENGTH = 1200;

const PRIVATE_CONTEXT_MARKER = "\n\n<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>\n";

export type ClarificationTurn = {
  question: string;
  answer: string;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
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
