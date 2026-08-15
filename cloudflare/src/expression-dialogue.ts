export const supportedExpressionModes = ["NVC", "FACT_DISPUTE", "BOUNDARY"] as const;
export type SupportedExpressionMode = typeof supportedExpressionModes[number];

const privateClarificationMarker = "<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>";
export const maxAgentConversationTurns = 5;

type PrivateConversationTurn = {
  question: string;
  answer: string;
};

export type ExpressionConversationContext = {
  sourceText: string;
  turns: PrivateConversationTurn[];
  sourceRefs: string[];
};

const expressionQuestionIntents = [
  "CLARIFY_EVENT", "CLARIFY_FEELING", "CLARIFY_VALUE", "CLARIFY_REQUEST",
  "CLARIFY_BOUNDARY", "VERIFY_UNDERSTANDING", "NONE",
] as const;

const expressionStopReasons = [
  "NEEDS_CLARIFICATION", "SUFFICIENT_CONTEXT", "NO_NEW_INFORMATION", "TURN_LIMIT", "SAFETY",
] as const;
const expressionStopReasonsBeforeLimit = [
  "NEEDS_CLARIFICATION", "SUFFICIENT_CONTEXT", "NO_NEW_INFORMATION", "SAFETY",
] as const;

const groundingStatuses = ["USER_STATED", "USER_CONFIRMED", "MISSING"] as const;

export const fieldSchemas: Record<SupportedExpressionMode, Record<string, unknown>> = {
  NVC: {
    observation: { type: "string", maxLength: 3000 },
    feeling: { type: "string", maxLength: 3000 },
    need: { type: "string", maxLength: 3000 },
    request: { type: "string", maxLength: 3000 },
  },
  FACT_DISPUTE: {
    claim: { type: "string", maxLength: 3000 },
    basis: { type: "string", maxLength: 3000 },
    verificationRequest: { type: "string", maxLength: 3000 },
  },
  BOUNDARY: {
    boundary: { type: "string", maxLength: 3000 },
    reason: { type: "string", maxLength: 3000 },
    acceptableRange: { type: "string", maxLength: 3000 },
    selfProtectiveAction: { type: "string", maxLength: 3000 },
  },
};

function cleanPrivateText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizedQuestionIdentity(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function parseExpressionConversationSource(value: string): ExpressionConversationContext {
  const markerIndex = value.lastIndexOf(privateClarificationMarker);
  const sourceText = (markerIndex < 0 ? value : value.slice(0, markerIndex)).trim();
  const turns: PrivateConversationTurn[] = [];
  if (markerIndex >= 0) {
    try {
      const parsed = JSON.parse(value.slice(markerIndex + privateClarificationMarker.length).trim()) as {
        privateClarifications?: unknown;
      };
      if (Array.isArray(parsed.privateClarifications)) {
        for (const item of parsed.privateClarifications.slice(0, 8)) {
          if (!item || typeof item !== "object" || Array.isArray(item)) continue;
          const question = cleanPrivateText((item as { question?: unknown }).question, 500);
          const answer = cleanPrivateText((item as { answer?: unknown }).answer, 1200);
          if (question && answer) turns.push({ question, answer });
        }
      }
    } catch {
      // The source preceding the private envelope remains available when its JSON is malformed.
    }
  }
  return {
    sourceText,
    turns,
    sourceRefs: ["SOURCE", "CURRENT_DRAFT", ...turns.map((_, index) => `TURN.${index + 1}.ANSWER`)],
  };
}

export function sanitizedManualPayload(mode: SupportedExpressionMode, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(fieldSchemas[mode]).flatMap((key) => {
    const field = source[key];
    return typeof field === "string" && field.trim() ? [[key, field.trim().slice(0, 3000)]] : [];
  }));
}

export function expressionResultSchema(
  mode: SupportedExpressionMode,
  context: Pick<ExpressionConversationContext, "turns" | "sourceRefs"> = {
    turns: [],
    sourceRefs: ["SOURCE", "CURRENT_DRAFT"],
  },
) {
  const fields = fieldSchemas[mode];
  const atTurnLimit = context.turns.length >= maxAgentConversationTurns;
  const groundingProperties = Object.fromEntries(Object.keys(fields).map((key) => [key, {
    type: "object",
    additionalProperties: false,
    required: ["status", "sources"],
    properties: {
      status: { type: "string", enum: groundingStatuses },
      sources: {
        type: "array",
        maxItems: 8,
        items: { type: "string", enum: context.sourceRefs },
      },
    },
  }]));
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "mode", "fields", "uncertainties", "conversation", "grounding",
      "safetyDisposition", "safetyMessage",
    ],
    properties: {
      mode: { type: "string", enum: [mode] },
      fields: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(fields),
        properties: fields,
      },
      uncertainties: {
        type: "array",
        maxItems: 1,
        items: { type: "string", maxLength: 500 },
      },
      conversation: {
        type: "object",
        additionalProperties: false,
        required: [
          "state", "reflection", "tentativeUnderstanding", "question", "questionIntent", "stopReason",
        ],
        properties: {
          state: { type: "string", enum: atTurnLimit ? ["READY"] : ["ASK", "READY"] },
          reflection: { type: "string", minLength: 1, maxLength: 600 },
          tentativeUnderstanding: { type: "string", maxLength: 600 },
          question: { type: "string", maxLength: 500 },
          questionIntent: { type: "string", enum: expressionQuestionIntents },
          stopReason: {
            type: "string",
            enum: atTurnLimit ? ["TURN_LIMIT", "SAFETY"] : expressionStopReasonsBeforeLimit,
          },
        },
      },
      grounding: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(fields),
        properties: groundingProperties,
      },
      safetyDisposition: {
        type: "string",
        enum: ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"],
      },
      safetyMessage: { type: "string", maxLength: 1000 },
    },
  };
}

export function isExpressionResult(
  value: unknown,
  mode: SupportedExpressionMode,
  context: Pick<ExpressionConversationContext, "turns" | "sourceRefs"> = {
    turns: [],
    sourceRefs: ["SOURCE", "CURRENT_DRAFT"],
  },
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.mode !== mode || !candidate.fields || typeof candidate.fields !== "object" ||
    Array.isArray(candidate.fields) || !Array.isArray(candidate.uncertainties) ||
    !candidate.conversation || typeof candidate.conversation !== "object" ||
    Array.isArray(candidate.conversation) || !candidate.grounding ||
    typeof candidate.grounding !== "object" || Array.isArray(candidate.grounding) ||
    !["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"].includes(String(candidate.safetyDisposition)) ||
    typeof candidate.safetyMessage !== "string" || candidate.safetyMessage.length > 1000 ||
    (candidate.safetyDisposition === "ALLOW"
      ? candidate.safetyMessage.trim() !== ""
      : candidate.safetyMessage.trim() === "")) return false;
  const fields = candidate.fields as Record<string, unknown>;
  const conversation = candidate.conversation as Record<string, unknown>;
  const grounding = candidate.grounding as Record<string, unknown>;
  const expectedFields = Object.keys(fieldSchemas[mode]);
  if (Object.keys(fields).length !== expectedFields.length ||
    expectedFields.some((key) => typeof fields[key] !== "string" || String(fields[key]).length > 3000)) {
    return false;
  }
  if (Object.keys(conversation).length !== 6 ||
    !["ASK", "READY"].includes(String(conversation.state)) ||
    typeof conversation.reflection !== "string" || !conversation.reflection.trim() ||
    conversation.reflection.length > 600 || typeof conversation.tentativeUnderstanding !== "string" ||
    conversation.tentativeUnderstanding.length > 600 || typeof conversation.question !== "string" ||
    conversation.question.length > 500 ||
    !expressionQuestionIntents.includes(conversation.questionIntent as typeof expressionQuestionIntents[number]) ||
    !expressionStopReasons.includes(conversation.stopReason as typeof expressionStopReasons[number])) return false;

  const safetyDisposition = String(candidate.safetyDisposition);
  if (["BLOCK_SHARE", "PAUSE"].includes(safetyDisposition)) {
    if (conversation.state !== "READY" || conversation.stopReason !== "SAFETY") return false;
  } else if (conversation.stopReason === "SAFETY") return false;

  const questions = candidate.uncertainties as unknown[];
  const previousQuestions = new Set(context.turns.map((turn) => normalizedQuestionIdentity(turn.question)));
  if (conversation.state === "ASK") {
    if (context.turns.length >= maxAgentConversationTurns || !conversation.question.trim() ||
      conversation.questionIntent === "NONE" || conversation.stopReason !== "NEEDS_CLARIFICATION" ||
      questions.length !== 1 || questions[0] !== conversation.question ||
      previousQuestions.has(normalizedQuestionIdentity(conversation.question))) return false;
  } else if (conversation.question !== "" || conversation.questionIntent !== "NONE" ||
    conversation.stopReason === "NEEDS_CLARIFICATION" || questions.length !== 0 ||
    (context.turns.length < maxAgentConversationTurns && conversation.stopReason === "TURN_LIMIT") ||
    (context.turns.length >= maxAgentConversationTurns &&
      !["TURN_LIMIT", "SAFETY"].includes(String(conversation.stopReason)))) return false;

  if (Object.keys(grounding).length !== expectedFields.length) return false;
  const allowedSources = new Set(context.sourceRefs);
  return expectedFields.every((key) => {
    const evidence = grounding[key];
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) ||
      Object.keys(evidence).length !== 2) return false;
    const record = evidence as Record<string, unknown>;
    if (!groundingStatuses.includes(record.status as typeof groundingStatuses[number]) ||
      !Array.isArray(record.sources) || record.sources.length > 8 ||
      record.sources.some((source) => typeof source !== "string" || !allowedSources.has(source))) return false;
    const fieldHasText = String(fields[key]).trim().length > 0;
    if (record.status === "MISSING") return !fieldHasText && record.sources.length === 0;
    if (!fieldHasText || record.sources.length === 0) return false;
    return record.status !== "USER_CONFIRMED" || record.sources.some((source) =>
      typeof source === "string" && source.startsWith("TURN.")
    );
  });
}
