export const supportedExpressionModes = ["NVC", "FACT_DISPUTE", "BOUNDARY"] as const;
export type SupportedExpressionMode = typeof supportedExpressionModes[number];

const privateClarificationMarker = "<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>";

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

export function isRepeatedConversationQuestion(
  question: string,
  turns: readonly { question: string }[],
) {
  const identity = normalizedQuestionIdentity(question);
  return Boolean(identity) && turns.some((turn) => normalizedQuestionIdentity(turn.question) === identity);
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
        for (const item of parsed.privateClarifications) {
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

const otherPersonSubject =
  "(?:男朋友|女朋友|男友|女友|老公|老婆|丈夫|妻子|对象|伴侣|对方|他|她|他们|她们|TA|ta)";
const userRelationSubject =
  "(?:男朋友|女朋友|男友|女友|老公|老婆|丈夫|妻子|对象|伴侣)";

function escapedRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function generatedFeelingTerms(value: string) {
  return value
    .split(/[、,，;；/｜|\s]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 20)
    .slice(0, 24);
}

function feelingClauseOwner(clause: string, feeling: string) {
  const feelingPattern = escapedRegExp(feeling);
  const userOwnsFeeling = new RegExp(
    `(?:我的感受(?:是|为)?|我(?!的?${userRelationSubject})[^。！？!?；;\\n]{0,24}` +
      `(?:感到|感觉|觉得|有点|有些|很|挺|特别|非常|心里|身体|却|也|就|会|让我)?)` +
      `[^。！？!?；;\\n]{0,12}${feelingPattern}`,
    "iu",
  ).test(clause);
  if (userOwnsFeeling) return "USER";

  const otherOwnsFeeling = new RegExp(
    `${otherPersonSubject}[^。！？!?；;\\n]{0,36}` +
      `(?:说|表示|觉得|感觉|感到|表现|显得|有点|有些|很|挺|特别|非常|受不了)?` +
      `[^。！？!?；;\\n]{0,12}${feelingPattern}`,
    "iu",
  ).test(clause);
  return otherOwnsFeeling ? "OTHER" : "UNKNOWN";
}

function sourceClausesContaining(text: string, feeling: string) {
  return text
    .split(/[。！？!?；;\n]+/u)
    .map((item) => item.trim())
    .filter((item) => item.includes(feeling));
}

/**
 * Reject only the high-confidence failure mode where a generated NVC feeling is
 * grounded exclusively in language that explicitly attributes it to somebody
 * other than the current user. Ambiguous or paraphrased feelings remain a model
 * concern instead of being guessed by this guard.
 */
export function nvcFeelingBelongsToUser(
  value: unknown,
  context: ExpressionConversationContext,
  currentDraft: Record<string, string>,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const candidate = value as Record<string, unknown>;
  const fields = candidate.fields;
  const grounding = candidate.grounding;
  if (!fields || typeof fields !== "object" || Array.isArray(fields) ||
    !grounding || typeof grounding !== "object" || Array.isArray(grounding)) return true;

  const feeling = (fields as Record<string, unknown>).feeling;
  const feelingGrounding = (grounding as Record<string, unknown>).feeling;
  if (typeof feeling !== "string" || !feeling.trim() || !feelingGrounding ||
    typeof feelingGrounding !== "object" || Array.isArray(feelingGrounding)) return true;

  const manuallyConfirmedFeeling = currentDraft.feeling?.trim();
  if (manuallyConfirmedFeeling && manuallyConfirmedFeeling === feeling.trim()) return true;

  const sources = (feelingGrounding as Record<string, unknown>).sources;
  if (!Array.isArray(sources)) return true;
  const sourceTextByRef = new Map<string, string>([
    ["SOURCE", context.sourceText],
    ...context.turns.map((turn, index) => [`TURN.${index + 1}.ANSWER`, turn.answer] as const),
  ]);

  return generatedFeelingTerms(feeling).every((term) => {
    const clauses = sources.flatMap((source) => typeof source === "string"
      ? sourceClausesContaining(sourceTextByRef.get(source) ?? "", term)
      : []);
    if (clauses.length === 0) return true;
    const owners = clauses.map((clause) => feelingClauseOwner(clause, term));
    return owners.includes("USER") || !owners.includes("OTHER");
  });
}

export function expressionResultSchema(
  mode: SupportedExpressionMode,
  context: Pick<ExpressionConversationContext, "sourceRefs"> = {
    sourceRefs: ["SOURCE", "CURRENT_DRAFT"],
  },
) {
  const fields = fieldSchemas[mode];
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
          state: { type: "string", enum: ["ASK", "READY"] },
          reflection: { type: "string", minLength: 1, maxLength: 600 },
          tentativeUnderstanding: { type: "string", maxLength: 600 },
          question: { type: "string", maxLength: 500 },
          questionIntent: { type: "string", enum: expressionQuestionIntents },
          stopReason: {
            type: "string",
            enum: expressionStopReasons,
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

/**
 * Reconcile duplicated conversation-control fields before semantic validation.
 * The model sometimes emits a valid JSON object whose stop reason says the
 * dialogue is complete while stale question fields still describe an ASK turn.
 * Only protocol metadata is normalized here; user-facing expression fields,
 * grounding, reflections, and tentative understanding are left untouched.
 */
export function normalizeExpressionResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  if (!candidate.conversation || typeof candidate.conversation !== "object" ||
    Array.isArray(candidate.conversation)) return value;
  const conversation = candidate.conversation as Record<string, unknown>;
  const state = conversation.state;
  const stopReason = conversation.stopReason;
  const question = typeof conversation.question === "string" ? conversation.question : "";

  if (state === "ASK" && stopReason === "NEEDS_CLARIFICATION") {
    return {
      ...candidate,
      uncertainties: question.trim() ? [question] : candidate.uncertainties,
    };
  }

  if (state === "READY" &&
    ["SUFFICIENT_CONTEXT", "NO_NEW_INFORMATION", "SAFETY"].includes(String(stopReason))) {
    return {
      ...candidate,
      uncertainties: [],
      conversation: {
        ...conversation,
        question: "",
        questionIntent: "NONE",
      },
    };
  }

  return value;
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
  if (conversation.state === "ASK") {
    if (!conversation.question.trim() ||
      conversation.questionIntent === "NONE" || conversation.stopReason !== "NEEDS_CLARIFICATION" ||
      questions.length !== 1 || questions[0] !== conversation.question ||
      isRepeatedConversationQuestion(conversation.question, context.turns)) return false;
  } else if (conversation.question !== "" || conversation.questionIntent !== "NONE" ||
    conversation.stopReason === "NEEDS_CLARIFICATION" || questions.length !== 0) return false;

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
