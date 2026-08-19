export const MAX_CLARIFICATION_ANSWER_LENGTH = 1200;

const PRIVATE_CONTEXT_MARKER = "\n\n<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>\n";

export type ClarificationTurn = {
  question: string;
  answer: string;
};

export const discoveryDimensions = ["event", "userImpact", "communicationGoal"] as const;
export type DiscoveryDimension = typeof discoveryDimensions[number];
const legacyDiscoveryDimensions = ["event", "impact", "intention"] as const;
type LegacyDiscoveryDimension = typeof legacyDiscoveryDimensions[number];

type LegacyDiscoveryUnderstandingState = {
  schemaVersion: 1 | 2;
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

export const discoverySectionFields = {
  event: [
    "participants", "setting", "trigger", "keyInteraction",
    "conflictPoint", "historyPattern", "currentState",
  ],
  userImpact: ["emotion", "physicalReaction", "realLifeConsequence"],
  meaningToCommunicate: ["personalMeaning", "underlyingNeed"],
  desiredResponse: ["desiredUnderstanding", "desiredAction", "acceptableAlternative"],
} as const;
type DiscoverySection = keyof typeof discoverySectionFields;
type EventField = typeof discoverySectionFields.event[number];
type UserImpactField = typeof discoverySectionFields.userImpact[number];
type MeaningField = typeof discoverySectionFields.meaningToCommunicate[number];
type DesiredResponseField = typeof discoverySectionFields.desiredResponse[number];
export type DiscoveryField =
  | `event.${EventField}`
  | `userImpact.${UserImpactField}`
  | `meaningToCommunicate.${MeaningField}`
  | `desiredResponse.${DesiredResponseField}`;
export const discoveryFields = (Object.keys(discoverySectionFields) as DiscoverySection[])
  .flatMap((section) => discoverySectionFields[section]
    .map((field) => `${section}.${field}` as DiscoveryField));

export type DiscoveryDetailCoverage = {
  status: "ENOUGH" | "MISSING" | "NOT_RELEVANT";
  evidence: string[];
  missingInfo: string;
  relevanceReason: string;
};

export type DiscoveryUnderstandingStateV3 = {
  schemaVersion: 3;
  coverage: {
    event: Record<EventField, DiscoveryDetailCoverage>;
    userImpact: Record<UserImpactField, DiscoveryDetailCoverage>;
    meaningToCommunicate: Record<MeaningField, DiscoveryDetailCoverage>;
    desiredResponse: Record<DesiredResponseField, DiscoveryDetailCoverage>;
  };
  latestAnswerUpdate: {
    absorbed: boolean;
    updatedFields: DiscoveryField[];
  };
  nextQuestion: {
    focusField: DiscoveryField | "none";
    text: string;
    purpose: string;
  };
};

export type DiscoveryUnderstandingState =
  | LegacyDiscoveryUnderstandingState
  | DiscoveryUnderstandingStateV3;

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

function normalizedDiscoveryDimension(
  value: DiscoveryDimension | LegacyDiscoveryDimension,
): DiscoveryDimension {
  if (value === "impact") return "userImpact";
  if (value === "intention") return "communicationGoal";
  return value;
}

export function parseDiscoveryUnderstandingState(value: unknown): DiscoveryUnderstandingState | null {
  if (!isRecord(value) || !isRecord(value.coverage)) return null;
  if (value.schemaVersion === 3) return parseDiscoveryUnderstandingStateV3(value);
  const legacyCoverage = value.schemaVersion === undefined &&
    hasExactKeys(value.coverage, legacyDiscoveryDimensions);
  const currentCoverage = value.schemaVersion === 2 &&
    hasExactKeys(value.coverage, discoveryDimensions);
  if (!legacyCoverage && !currentCoverage) return null;
  const acceptedDimensions: readonly string[] = legacyCoverage
    ? legacyDiscoveryDimensions
    : discoveryDimensions;

  if (
    !isRecord(value.latestAnswerUpdate) ||
    !hasExactKeys(value.latestAnswerUpdate, ["absorbed", "updatedDimensions"]) ||
    typeof value.latestAnswerUpdate.absorbed !== "boolean" ||
    !Array.isArray(value.latestAnswerUpdate.updatedDimensions) ||
    value.latestAnswerUpdate.updatedDimensions.length > 3 ||
    new Set(value.latestAnswerUpdate.updatedDimensions).size !==
      value.latestAnswerUpdate.updatedDimensions.length ||
    !value.latestAnswerUpdate.updatedDimensions.every((item) =>
      typeof item === "string" && acceptedDimensions.includes(item)) ||
    !isRecord(value.nextQuestion) ||
    !hasExactKeys(value.nextQuestion, ["focusDimension", "text", "purpose"]) ||
    ![...acceptedDimensions, "none"].includes(String(value.nextQuestion.focusDimension)) ||
    typeof value.nextQuestion.text !== "string" || value.nextQuestion.text.length > 500 ||
    typeof value.nextQuestion.purpose !== "string" || value.nextQuestion.purpose.length > 300) return null;

  const normalizedCoverage = legacyCoverage
    ? {
      event: value.coverage.event,
      userImpact: value.coverage.impact,
      communicationGoal: value.coverage.intention,
    }
    : value.coverage;

  const coverage = {} as LegacyDiscoveryUnderstandingState["coverage"];
  for (const dimension of discoveryDimensions) {
    const item = normalizedCoverage[dimension];
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
    schemaVersion: legacyCoverage ? 1 : 2,
    coverage,
    latestAnswerUpdate: {
      absorbed: value.latestAnswerUpdate.absorbed,
      updatedDimensions: value.latestAnswerUpdate.updatedDimensions.map((dimension) =>
        normalizedDiscoveryDimension(dimension as DiscoveryDimension | LegacyDiscoveryDimension)),
    },
    nextQuestion: {
      focusDimension: value.nextQuestion.focusDimension === "none"
        ? "none"
        : normalizedDiscoveryDimension(
          value.nextQuestion.focusDimension as DiscoveryDimension | LegacyDiscoveryDimension,
        ),
      text: value.nextQuestion.text,
      purpose: value.nextQuestion.purpose,
    },
  };
}

function parseDiscoveryDetailCoverage(value: unknown): DiscoveryDetailCoverage | null {
  if (!isRecord(value) ||
    !hasExactKeys(value, ["status", "evidence", "missingInfo", "relevanceReason"]) ||
    !["ENOUGH", "MISSING", "NOT_RELEVANT"].includes(String(value.status)) ||
    !Array.isArray(value.evidence) || value.evidence.length > 3 ||
    !value.evidence.every((evidence) =>
      typeof evidence === "string" && Boolean(evidence.trim()) && evidence.length <= 240) ||
    typeof value.missingInfo !== "string" || value.missingInfo.length > 300 ||
    typeof value.relevanceReason !== "string" || value.relevanceReason.length > 300) return null;
  if (value.status === "ENOUGH" &&
    (!value.evidence.length || value.missingInfo.trim() || value.relevanceReason.trim())) return null;
  if (value.status === "MISSING" &&
    (!value.missingInfo.trim() || value.relevanceReason.trim())) return null;
  if (value.status === "NOT_RELEVANT" &&
    (value.evidence.length || value.missingInfo.trim() || !value.relevanceReason.trim())) return null;
  return {
    status: value.status as DiscoveryDetailCoverage["status"],
    evidence: value.evidence as string[],
    missingInfo: value.missingInfo,
    relevanceReason: value.relevanceReason,
  };
}

function parseDiscoveryUnderstandingStateV3(
  value: Record<string, unknown>,
): DiscoveryUnderstandingStateV3 | null {
  if (!isRecord(value.coverage) ||
    !hasExactKeys(value.coverage, Object.keys(discoverySectionFields)) ||
    !isRecord(value.latestAnswerUpdate) ||
    !hasExactKeys(value.latestAnswerUpdate, ["absorbed", "updatedFields"]) ||
    typeof value.latestAnswerUpdate.absorbed !== "boolean" ||
    !Array.isArray(value.latestAnswerUpdate.updatedFields) ||
    value.latestAnswerUpdate.updatedFields.length > discoveryFields.length ||
    new Set(value.latestAnswerUpdate.updatedFields).size !== value.latestAnswerUpdate.updatedFields.length ||
    !value.latestAnswerUpdate.updatedFields.every((field) =>
      typeof field === "string" && discoveryFields.includes(field as DiscoveryField)) ||
    !isRecord(value.nextQuestion) ||
    !hasExactKeys(value.nextQuestion, ["focusField", "text", "purpose"]) ||
    ![...discoveryFields, "none"].includes(String(value.nextQuestion.focusField)) ||
    typeof value.nextQuestion.text !== "string" || value.nextQuestion.text.length > 500 ||
    typeof value.nextQuestion.purpose !== "string" || value.nextQuestion.purpose.length > 300) return null;

  const coverage: Record<string, Record<string, DiscoveryDetailCoverage>> = {};
  for (const section of Object.keys(discoverySectionFields) as DiscoverySection[]) {
    const sectionValue = value.coverage[section];
    if (!isRecord(sectionValue) || !hasExactKeys(sectionValue, discoverySectionFields[section])) return null;
    const parsedSection: Record<string, DiscoveryDetailCoverage> = {};
    for (const field of discoverySectionFields[section]) {
      const detail = parseDiscoveryDetailCoverage(sectionValue[field]);
      if (!detail) return null;
      parsedSection[field] = detail;
    }
    coverage[section] = parsedSection;
  }

  return {
    schemaVersion: 3,
    coverage: coverage as DiscoveryUnderstandingStateV3["coverage"],
    latestAnswerUpdate: {
      absorbed: value.latestAnswerUpdate.absorbed,
      updatedFields: value.latestAnswerUpdate.updatedFields as DiscoveryField[],
    },
    nextQuestion: {
      focusField: value.nextQuestion.focusField as DiscoveryField | "none",
      text: value.nextQuestion.text,
      purpose: value.nextQuestion.purpose,
    },
  };
}

export function discoveryUnderstandingV3IsReady(value: DiscoveryUnderstandingStateV3) {
  const eventResolved = discoverySectionFields.event.every((field) =>
    value.coverage.event[field].status !== "MISSING");
  const eventCoreEnough = (["participants", "trigger", "keyInteraction", "conflictPoint"] as const)
    .every((field) => value.coverage.event[field].status === "ENOUGH");
  const sectionReady = (section: "userImpact" | "meaningToCommunicate" | "desiredResponse") => {
    const fields = discoverySectionFields[section];
    const sectionCoverage = value.coverage[section] as unknown as Record<string, DiscoveryDetailCoverage>;
    const details = fields.map((field) => sectionCoverage[field]);
    return details.every((detail) => detail.status !== "MISSING") &&
      details.some((detail) => detail.status === "ENOUGH");
  };
  return eventResolved && eventCoreEnough && sectionReady("userImpact") &&
    sectionReady("meaningToCommunicate") && sectionReady("desiredResponse");
}

export function discoveryUnderstandingV3FocusIsMissing(value: DiscoveryUnderstandingStateV3) {
  if (value.nextQuestion.focusField === "none") return false;
  const [section, field] = value.nextQuestion.focusField.split(".") as [DiscoverySection, string];
  const sectionValue = value.coverage[section] as unknown as Record<string, DiscoveryDetailCoverage>;
  return sectionValue[field]?.status === "MISSING";
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
  return value.flatMap((item) => {
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
  const answered = new Set(turns.map((turn) => turn.question.trim()));
  return uncertainties
    .map((item) => item.trim())
    .find((item) => item && !answered.has(item)) ?? "";
}

export function optionalClarificationQuestion(turns: readonly ClarificationTurn[]) {
  const answered = new Set(turns.map((turn) => turn.question.trim()));
  return optionalClarificationPrompts.find((question) => !answered.has(question)) ?? "";
}

export function expressionCandidateClarificationQuestion(
  uncertainties: readonly string[],
  turns: readonly ClarificationTurn[],
  expression?: ClarificationExpression,
  fields: readonly ClarificationField[] = [],
) {
  return nextClarificationQuestion(uncertainties, turns) ||
    nextMissingFieldQuestion(expression, fields, turns);
}

export function nextMissingFieldQuestion(
  expression: ClarificationExpression | undefined,
  fields: readonly ClarificationField[],
  turns: readonly ClarificationTurn[],
) {
  if (!expression) return "";
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
