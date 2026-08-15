import { createClient } from "@supabase/supabase-js";
import { requestStructuredOutput, REVIEW_MODEL } from "./cloudflare-ai.ts";
import type { WorkerEnv } from "./http.ts";
import { logQueueBatch, logQueueMessage, type LogSink } from "./observability.ts";

export const supportedExpressionModes = ["NVC", "FACT_DISPUTE", "BOUNDARY"] as const;
export type SupportedExpressionMode = typeof supportedExpressionModes[number];

type ClaimPayload = {
  claimed: true;
  jobId: string;
  jobType: "UNDERSTAND";
  selectedMode: SupportedExpressionMode;
  sourceText: string;
};

type ConfirmedExpression = {
  mode: SupportedExpressionMode;
  payload: Record<string, unknown>;
};

type UnderstandingClaimPayload = {
  claimed: true;
  jobId: string;
  jobType: "CONSENSUS" | "REVIEW_UNDERSTANDING";
  semanticAttempt: number;
  expressionA: ConfirmedExpression;
  expressionB: ConfirmedExpression;
  candidate?: unknown;
  previousCandidate?: unknown;
  reviewIssues?: unknown;
};

type DialogueContext = unknown[];

type ConfirmedDialogueTurn = {
  sequence: number;
  round: number;
  kind: "OPENING" | "REFLECTION" | "REFLECTION_CONFIRMATION" | "RESPONSE";
  authorRole: "A" | "B";
  source: `DIALOGUE.${"OPENING" | "REFLECTION" | "REFLECTION_CONFIRMATION" | "RESPONSE"}.${"A" | "B"}.${number}`;
  replyToSequence: number | null;
  payload: Record<string, unknown>;
};

type QueueMessage = { jobId: string; correlationId?: string };

type QueueMessageEnvelope = {
  body: unknown;
  ack(): void;
  retry(): void;
};

type QueueOutcome = "succeeded" | "retried" | "discarded";

type QueueResult = {
  correlationId?: string;
  outcome: QueueOutcome;
  errorCode?: string;
};

export type QueueBatch = {
  messages: QueueMessageEnvelope[];
};

const privateClarificationMarker = "<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>";

const fieldSchemas: Record<SupportedExpressionMode, Record<string, unknown>> = {
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

const understandingSourceKeys = [
  "A.observation", "A.feeling", "A.need", "A.request",
  "A.claim", "A.basis", "A.verificationRequest",
  "A.boundary", "A.reason", "A.acceptableRange", "A.selfProtectiveAction",
  "B.observation", "B.feeling", "B.need", "B.request",
  "B.claim", "B.basis", "B.verificationRequest",
  "B.boundary", "B.reason", "B.acceptableRange", "B.selfProtectiveAction",
] as const;

const boundarySourceKeys = [
  "A.boundary", "A.acceptableRange", "A.selfProtectiveAction",
  "B.boundary", "B.acceptableRange", "B.selfProtectiveAction",
] as const;

const evidenceItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "sources"],
  properties: {
    text: { type: "string", maxLength: 1200 },
    sources: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string", enum: understandingSourceKeys },
    },
  },
};

const boundaryEvidenceItemSchema = {
  ...evidenceItemSchema,
  properties: {
    ...evidenceItemSchema.properties,
    sources: {
      ...evidenceItemSchema.properties.sources,
      items: { type: "string", enum: boundarySourceKeys },
    },
  },
};

const mutualUnderstandingItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["listenerRole", "speakerRole", "text", "sources"],
  properties: {
    listenerRole: { type: "string", enum: ["A", "B"] },
    speakerRole: { type: "string", enum: ["A", "B"] },
    text: { type: "string", maxLength: 1200 },
    sources: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: { type: "string", enum: understandingSourceKeys },
    },
  },
};

export const understandingResultSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "mutualUnderstanding", "newUnderstanding", "differences",
    "unverifiedFacts", "boundaries", "nextQuestion", "safetyDisposition", "safetyMessage",
  ],
  properties: {
    schemaVersion: { type: "integer", enum: [2] },
    mutualUnderstanding: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: mutualUnderstandingItemSchema,
    },
    newUnderstanding: evidenceItemSchema,
    differences: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "sideA", "sideB", "sources"],
        properties: {
          topic: { type: "string", maxLength: 500 },
          sideA: { type: "string", maxLength: 1200 },
          sideB: { type: "string", maxLength: 1200 },
          sources: evidenceItemSchema.properties.sources,
        },
      },
    },
    unverifiedFacts: { type: "array", maxItems: 6, items: evidenceItemSchema },
    boundaries: { type: "array", maxItems: 6, items: boundaryEvidenceItemSchema },
    nextQuestion: evidenceItemSchema,
    safetyDisposition: { type: "string", enum: ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"] },
    safetyMessage: { type: "string", maxLength: 1000 },
  },
} as const;

export const understandingReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "issues", "safetyDisposition", "safetyMessage"],
  properties: {
    verdict: { type: "string", enum: ["PASS", "REVISE", "BLOCK"] },
    issues: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message", "sources"],
        properties: {
          code: {
            type: "string",
            enum: [
              "UNSUPPORTED", "UNCONFIRMED_HEARING", "NO_UNDERSTANDING_GAIN", "GENERIC_NEXT_QUESTION",
              "FALSE_CONSENSUS", "FACT_AS_TRUTH", "BOUNDARY_DILUTED", "PRIVATE_LEAK", "UNSAFE",
            ],
          },
          message: { type: "string", maxLength: 800 },
          sources: { type: "array", maxItems: 8, items: { type: "string", enum: understandingSourceKeys } },
        },
      },
    },
    safetyDisposition: { type: "string", enum: ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"] },
    safetyMessage: { type: "string", maxLength: 1000 },
  },
} as const;

export function expressionResultSchema(mode: SupportedExpressionMode, requireClarification = false) {
  const fields = fieldSchemas[mode];
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "fields", "uncertainties", "safetyDisposition", "safetyMessage"],
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
        ...(requireClarification ? { minItems: 1 } : {}),
        maxItems: 1,
        items: { type: "string", maxLength: 500 },
      },
      safetyDisposition: {
        type: "string",
        enum: ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"],
      },
      safetyMessage: { type: "string", maxLength: 1000 },
    },
  };
}

export function isSupportedExpressionMode(value: unknown): value is SupportedExpressionMode {
  return supportedExpressionModes.includes(value as SupportedExpressionMode);
}

export function isExpressionResult(value: unknown, mode: SupportedExpressionMode) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.mode !== mode || !candidate.fields || typeof candidate.fields !== "object" ||
    Array.isArray(candidate.fields) || !Array.isArray(candidate.uncertainties) ||
    !["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"].includes(String(candidate.safetyDisposition)) ||
    typeof candidate.safetyMessage !== "string" || candidate.safetyMessage.length > 1000 ||
    (candidate.safetyDisposition === "ALLOW"
      ? candidate.safetyMessage.trim() !== ""
      : candidate.safetyMessage.trim() === "")) return false;
  const fields = candidate.fields as Record<string, unknown>;
  const expectedFields = Object.keys(fieldSchemas[mode]);
  if (Object.keys(fields).length !== expectedFields.length ||
    expectedFields.some((key) => typeof fields[key] !== "string" || String(fields[key]).length > 3000)) {
    return false;
  }
  return candidate.uncertainties.length <= 1 && candidate.uncertainties.every((item) =>
    typeof item === "string" && item.length <= 500
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDialogueSource(value: string) {
  return /^DIALOGUE\.(OPENING|REFLECTION|REFLECTION_CONFIRMATION|RESPONSE)\.[AB]\.[1-9]\d*$/.test(value);
}

function isUnderstandingSource(value: string) {
  return understandingSourceKeys.includes(value as typeof understandingSourceKeys[number]) ||
    isDialogueSource(value);
}

function sourceRole(value: string) {
  if (value.startsWith("A.")) return "A";
  if (value.startsWith("B.")) return "B";
  const dialogue = /^DIALOGUE\.(OPENING|REFLECTION|REFLECTION_CONFIRMATION|RESPONSE)\.([AB])\./.exec(value);
  return dialogue?.[1] === "REFLECTION" ? null : dialogue?.[2] ?? null;
}

function sourceAuthorRole(value: string) {
  if (value.startsWith("A.")) return "A";
  if (value.startsWith("B.")) return "B";
  return /^DIALOGUE\.(?:OPENING|REFLECTION|REFLECTION_CONFIRMATION|RESPONSE)\.([AB])\./.exec(value)?.[1] ?? null;
}

function isDialogueBoundarySource(value: string) {
  return /^DIALOGUE\.(OPENING|REFLECTION_CONFIRMATION|RESPONSE)\.[AB]\.[1-9]\d*$/.test(value);
}

function isSourceList(value: unknown, allowEmpty = false): value is string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= 8 &&
    value.every((item) => typeof item === "string" && isUnderstandingSource(item));
}

function isEvidenceItem(value: unknown) {
  return isRecord(value) && Object.keys(value).length === 2 &&
    typeof value.text === "string" && value.text.length <= 1200 &&
    isSourceList(value.sources);
}

function hasBothSides(sources: unknown) {
  return isSourceList(sources) && sources.some((source) => sourceRole(source) === "A") &&
    sources.some((source) => sourceRole(source) === "B");
}

function isBoundaryEvidenceItem(value: unknown) {
  return isEvidenceItem(value) && (value as { sources: string[] }).sources.every((source) =>
    boundarySourceKeys.includes(source as typeof boundarySourceKeys[number]) || isDialogueBoundarySource(source)
  );
}

function isMutualUnderstandingItem(value: unknown) {
  if (!isRecord(value) || Object.keys(value).length !== 4 ||
    !["A", "B"].includes(String(value.listenerRole)) ||
    !["A", "B"].includes(String(value.speakerRole)) ||
    value.listenerRole === value.speakerRole || typeof value.text !== "string" ||
    value.text.length > 1200 || !isSourceList(value.sources) || value.sources.length < 3) return false;
  const listener = String(value.listenerRole);
  const speaker = String(value.speakerRole);
  return value.sources.some((source) => new RegExp(`^DIALOGUE\\.(OPENING|RESPONSE)\\.${speaker}\\.`).test(source)) &&
    value.sources.some((source) => new RegExp(`^DIALOGUE\\.REFLECTION\\.${listener}\\.`).test(source)) &&
    value.sources.some((source) => new RegExp(`^DIALOGUE\\.REFLECTION_CONFIRMATION\\.${speaker}\\.`).test(source));
}

export function isUnderstandingResult(value: unknown) {
  const newUnderstandingRoles = isRecord(value) && isEvidenceItem(value.newUnderstanding)
    ? new Set((value.newUnderstanding as { sources: string[] }).sources.map(sourceAuthorRole))
    : new Set<string | null>();
  if (!isRecord(value) || Object.keys(value).length !== 9 || value.schemaVersion !== 2 ||
    !Array.isArray(value.mutualUnderstanding) || value.mutualUnderstanding.length !== 2 ||
    !value.mutualUnderstanding.every(isMutualUnderstandingItem) ||
    new Set(value.mutualUnderstanding.map((item) => (item as Record<string, unknown>).listenerRole)).size !== 2 ||
    !isEvidenceItem(value.newUnderstanding) ||
    !Array.isArray(value.differences) || value.differences.length > 6 ||
    !Array.isArray(value.unverifiedFacts) || value.unverifiedFacts.length > 6 ||
    !Array.isArray(value.boundaries) || value.boundaries.length > 6 ||
    !isEvidenceItem(value.nextQuestion) ||
    !hasBothSides((value.nextQuestion as { sources: unknown }).sources) ||
    !(value.newUnderstanding as { sources: string[] }).sources.every(isDialogueSource) ||
    !newUnderstandingRoles.has("A") || !newUnderstandingRoles.has("B") ||
    !["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"].includes(String(value.safetyDisposition)) ||
    typeof value.safetyMessage !== "string" || value.safetyMessage.length > 1000 ||
    (value.safetyDisposition === "ALLOW" ? value.safetyMessage.trim() !== "" : value.safetyMessage.trim() === "")) {
    return false;
  }
  if (!value.unverifiedFacts.every(isEvidenceItem) || !value.boundaries.every(isBoundaryEvidenceItem)) return false;
  return value.differences.every((item) => isRecord(item) && Object.keys(item).length === 4 &&
    typeof item.topic === "string" && item.topic.length <= 500 &&
    typeof item.sideA === "string" && item.sideA.length <= 1200 &&
    !understandingSourceKeys.includes(item.sideA as typeof understandingSourceKeys[number]) &&
    typeof item.sideB === "string" && item.sideB.length <= 1200 &&
    !understandingSourceKeys.includes(item.sideB as typeof understandingSourceKeys[number]) &&
    hasBothSides(item.sources));
}

export function isUnderstandingReview(value: unknown) {
  if (!isRecord(value) || Object.keys(value).length !== 4 ||
    !["PASS", "REVISE", "BLOCK"].includes(String(value.verdict)) ||
    !Array.isArray(value.issues) || value.issues.length > 8 ||
    !["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"].includes(String(value.safetyDisposition)) ||
    typeof value.safetyMessage !== "string" || value.safetyMessage.length > 1000 ||
    (value.safetyDisposition === "ALLOW"
      ? value.safetyMessage.trim() !== ""
      : value.safetyMessage.trim() === "") ||
    (value.verdict === "BLOCK"
      ? !["BLOCK_SHARE", "PAUSE"].includes(String(value.safetyDisposition))
      : !["ALLOW", "WARN"].includes(String(value.safetyDisposition))) ||
    ((value.verdict === "PASS") !== (Array.isArray(value.issues) && value.issues.length === 0))) return false;
  return value.issues.every((issue) => isRecord(issue) && Object.keys(issue).length === 3 &&
    [
      "UNSUPPORTED", "UNCONFIRMED_HEARING", "NO_UNDERSTANDING_GAIN", "GENERIC_NEXT_QUESTION",
      "FALSE_CONSENSUS", "FACT_AS_TRUTH", "BOUNDARY_DILUTED", "PRIVATE_LEAK", "UNSAFE",
    ]
      .includes(String(issue.code)) &&
    typeof issue.message === "string" && issue.message.length <= 800 &&
    isSourceList(issue.sources, true));
}

function isConfirmedExpression(value: unknown): value is ConfirmedExpression {
  return isRecord(value) && isSupportedExpressionMode(value.mode) && isRecord(value.payload);
}

function sanitizedConfirmedExpression(expression: ConfirmedExpression): ConfirmedExpression {
  const payload: Record<string, string> = {};
  for (const field of Object.keys(fieldSchemas[expression.mode])) {
    const value = expression.payload[field];
    if (typeof value === "string") payload[field] = value;
  }
  return { mode: expression.mode, payload };
}

function sanitizedDialogueTimeline(value: DialogueContext | undefined): ConfirmedDialogueTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: ConfirmedDialogueTurn[] = [];
  for (const item of value.slice(-80)) {
    if (!isRecord(item) || !Number.isSafeInteger(item.sequence) || Number(item.sequence) < 1 ||
      !Number.isSafeInteger(item.round) || Number(item.round) < 1 ||
      !["OPENING", "REFLECTION", "REFLECTION_CONFIRMATION", "RESPONSE"].includes(String(item.kind)) ||
      !["A", "B"].includes(String(item.authorRole)) || !isRecord(item.payload)) continue;
    const sequence = Number(item.sequence);
    const authorRole = item.authorRole as "A" | "B";
    const kind = item.kind as ConfirmedDialogueTurn["kind"];
    const source = `DIALOGUE.${kind}.${authorRole}.${sequence}` as const;
    let payload: Record<string, unknown>;
    if (item.kind === "OPENING") {
      const mode = item.payload.mode;
      const card = item.payload.card;
      if (!isSupportedExpressionMode(mode) || !isRecord(card)) continue;
      payload = { mode, card: sanitizedConfirmedExpression({ mode, payload: card }).payload };
    } else if (item.kind === "REFLECTION_CONFIRMATION") {
      if (!["ACCURATE", "NEEDS_CORRECTION"].includes(String(item.payload.decision)) ||
        typeof item.payload.feedback !== "string") continue;
      payload = {
        decision: item.payload.decision,
        feedback: item.payload.feedback.slice(0, 1200),
      };
    } else {
      if (typeof item.payload.text !== "string") continue;
      payload = { text: item.payload.text.slice(0, 3000) };
    }
    const replyToSequence = item.replyToSequence === null || item.replyToSequence === undefined
      ? null
      : Number.isSafeInteger(item.replyToSequence) && Number(item.replyToSequence) > 0
        ? Number(item.replyToSequence)
        : null;
    turns.push({
      sequence,
      round: Number(item.round),
      kind,
      authorRole,
      source,
      replyToSequence,
      payload,
    });
  }
  return turns;
}

function availableSources(input: {
  expressionA: ConfirmedExpression;
  expressionB: ConfirmedExpression;
  confirmedDialogueTimeline?: ConfirmedDialogueTurn[];
}) {
  const sources: string[] = [];
  for (const [prefix, expression] of [["A", input.expressionA], ["B", input.expressionB]] as const) {
    for (const field of Object.keys(fieldSchemas[expression.mode])) {
      if (typeof expression.payload[field] === "string" && String(expression.payload[field]).trim()) {
        sources.push(`${prefix}.${field}`);
      }
    }
  }
  for (const turn of input.confirmedDialogueTimeline ?? []) sources.push(turn.source);
  return sources;
}

function usesOnlyAvailableSources(value: unknown, sources: Set<string>) {
  if (!isRecord(value)) return false;
  const lists: unknown[] = [];
  for (const key of ["mutualUnderstanding", "unverifiedFacts", "boundaries"] as const) {
    const items = value[key];
    if (Array.isArray(items)) lists.push(...items.map((item) => isRecord(item) ? item.sources : null));
  }
  if (Array.isArray(value.differences)) {
    lists.push(...value.differences.map((item) => isRecord(item) ? item.sources : null));
  }
  for (const key of ["newUnderstanding", "nextQuestion"] as const) {
    const item = value[key];
    lists.push(isRecord(item) ? item.sources : null);
  }
  return lists.every((list) => Array.isArray(list) && list.every((source) =>
    typeof source === "string" && sources.has(source)
  ));
}

function mutualEvidenceChainsAreConfirmed(value: unknown, timeline: ConfirmedDialogueTurn[]) {
  if (!isRecord(value) || !Array.isArray(value.mutualUnderstanding)) return false;
  const bySource = new Map<string, ConfirmedDialogueTurn>(timeline.map((turn) => [turn.source, turn]));
  return value.mutualUnderstanding.every((item) => {
    if (!isMutualUnderstandingItem(item)) return false;
    const sources = (item as { sources: string[] }).sources;
    const listenerRole = (item as { listenerRole: "A" | "B" }).listenerRole;
    const speakerRole = (item as { speakerRole: "A" | "B" }).speakerRole;
    const statement = sources.map((source) => bySource.get(source)).find((turn) =>
      turn?.authorRole === speakerRole && ["OPENING", "RESPONSE"].includes(turn.kind)
    );
    const reflection = sources.map((source) => bySource.get(source)).find((turn) =>
      turn?.kind === "REFLECTION" && turn.authorRole === listenerRole &&
      turn.replyToSequence === statement?.sequence
    );
    return sources.map((source) => bySource.get(source)).some((turn) =>
      turn?.kind === "REFLECTION_CONFIRMATION" && turn.authorRole === speakerRole &&
      turn.replyToSequence === reflection?.sequence && turn.payload.decision === "ACCURATE"
    );
  });
}

function reviewUsesOnlyAvailableSources(value: unknown, sources: Set<string>) {
  return isRecord(value) && Array.isArray(value.issues) && value.issues.every((issue) =>
    isRecord(issue) && Array.isArray(issue.sources) && issue.sources.every((source) =>
      typeof source === "string" && sources.has(source)
    )
  );
}

function withoutUnavailableBoundaries(value: unknown, sources: Set<string>) {
  if (!isRecord(value) || !Array.isArray(value.boundaries)) return value;
  return {
    ...value,
    boundaries: value.boundaries.filter((item) => isRecord(item) && Array.isArray(item.sources) &&
      item.sources.every((source) => typeof source === "string" && sources.has(source))),
  };
}

function canonicalGeneratedText(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/g, " ")
    : "";
}

function uniqueGeneratedItems(
  value: unknown,
  key: (item: Record<string, unknown>) => string,
) {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  return value.filter((item) => {
    if (!isRecord(item)) return true;
    const normalizedKey = key(item);
    if (!normalizedKey || seen.has(normalizedKey)) return !normalizedKey;
    seen.add(normalizedKey);
    return true;
  });
}

export function normalizeUnderstandingResult(value: unknown) {
  if (!isRecord(value)) return value;
  const evidenceKey = (item: Record<string, unknown>) => canonicalGeneratedText(item.text);
  const differenceKey = (item: Record<string, unknown>) => [item.topic, item.sideA, item.sideB]
    .map(canonicalGeneratedText)
    .join("\u0000");
  return {
    ...value,
    mutualUnderstanding: uniqueGeneratedItems(
      value.mutualUnderstanding,
      (item) => `${item.listenerRole}\u0000${item.speakerRole}\u0000${canonicalGeneratedText(item.text)}`,
    ),
    differences: uniqueGeneratedItems(value.differences, differenceKey),
    unverifiedFacts: uniqueGeneratedItems(value.unverifiedFacts, evidenceKey),
    boundaries: uniqueGeneratedItems(value.boundaries, evidenceKey),
  };
}

function sourceRestrictedSchema<T>(schema: T, sources: string[]) {
  const copy = structuredClone(schema) as unknown;
  const boundarySources = sources.filter((source) =>
    boundarySourceKeys.includes(source as typeof boundarySourceKeys[number]) || isDialogueBoundarySource(source)
  );
  const visit = (value: unknown, withinBoundaries = false) => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, withinBoundaries));
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const nextWithinBoundaries = withinBoundaries || key === "boundaries";
      if (key === "enum" && Array.isArray(child) && child.length > 0 &&
        child.every((item) => typeof item === "string" &&
          understandingSourceKeys.includes(item as typeof understandingSourceKeys[number]))) {
        value[key] = nextWithinBoundaries && boundarySources.length > 0
          ? boundarySources
          : nextWithinBoundaries
            ? child
            : sources;
      } else {
        visit(child, nextWithinBoundaries);
      }
    }
  };
  visit(copy);
  return copy as T;
}

export function parseQueueMessage(value: unknown): QueueMessage | null {
  if (!value || typeof value !== "object") return null;
  const keys = Object.keys(value);
  if (!keys.includes("jobId") || keys.some((key) => !["jobId", "correlationId"].includes(key))) return null;
  const { jobId, correlationId } = value as { jobId?: unknown; correlationId?: unknown };
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof jobId !== "string" || !uuidPattern.test(jobId)) return null;
  if (correlationId !== undefined &&
    (typeof correlationId !== "string" || !uuidPattern.test(correlationId))) return null;
  return { jobId, ...(correlationId ? { correlationId } : {}) };
}

function adminClient(env: WorkerEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function modeInstruction(mode: SupportedExpressionMode) {
  if (mode === "NVC") {
    return "按非暴力沟通的观察、感受、需要、请求整理。观察只保留可核实事件；请求必须具体、可拒绝。";
  }
  if (mode === "FACT_DISPUTE") {
    return "保留用户主张、依据和待核实事项。不得裁判真假，不得把推测改写成事实。";
  }
  return "整理清晰边界、可选原因、可接受范围和自我保护行动。边界不需要对方同意才成立。";
}

export async function generateExpressionCandidate(
  env: WorkerEnv,
  input: { mode: SupportedExpressionMode; sourceText: string },
) {
  const requireClarification = !input.sourceText.includes(privateClarificationMarker);
  return requestStructuredOutput(env, {
    schemaName: `shuokai_${input.mode.toLowerCase()}_expression`,
    schema: expressionResultSchema(input.mode, requireClarification),
    systemText: [
      "你是‘说开’的表达整理助手。只整理用户已经表达的内容，不补造事实、不诊断任何人、不替用户作决定。",
      modeInstruction(input.mode),
      "uncertainties 是给用户看的下一句追问。只返回当前最重要的 1 个问题，不要一次列多个；只问一件会影响表达准确性的关键信息，写成简短、具体、非诱导的中文问句。",
      "第一次整理原话时 uncertainties 必须包含 1 个基于原话的背景问题，让用户先通过对话补全信息，再确认表达卡。",
      "若 sourceText 含 privateClarifications 或私密补充问答，把回答视为用户补充的背景，不当作已核实事实；不要重复已经回答的问题。不要因为已经问过一次就结束。只有必要字段都有具体内容、指代与时间背景不再影响理解、用户希望对方理解的重点和具体请求已经清楚时，uncertainties 才可以返回空数组；否则继续问当前最关键的一件事。",
      "不要索取姓名、地址、联系方式、账号或诊断等非必要敏感信息。发现胁迫、自伤、伤人或明显危险时，用安全字段真实标记；不要把安全提醒塞进分享字段。",
      "普通的难过、嫉妒、失望、争吵、关系不安、分手或情感困扰本身不是阻止分享的理由，通常应为 ALLOW。只有分享本身可能带来现实危险时才使用 WARN；只有明确的胁迫、暴力、自伤、伤人或迫近危险才使用 BLOCK_SHARE 或 PAUSE。",
      "输出中文。字段不足时留空，让用户本人补充和确认。",
    ].join("\n"),
    userData: { sourceText: input.sourceText },
    maxTokens: 1800,
    validate: (value) => isExpressionResult(value, input.mode) &&
      (!requireClarification || (value as { uncertainties: unknown[] }).uncertainties.length === 1),
  });
}

export function generateSharedUnderstanding(env: WorkerEnv, input: {
  expressionA: ConfirmedExpression;
  expressionB: ConfirmedExpression;
  previousCandidate?: unknown;
  reviewIssues?: unknown;
  dialogueTimeline?: DialogueContext;
}) {
  const confirmedDialogueTimeline = sanitizedDialogueTimeline(input.dialogueTimeline);
  const modelInput = {
    expressionA: sanitizedConfirmedExpression(input.expressionA),
    expressionB: sanitizedConfirmedExpression(input.expressionB),
    ...(input.previousCandidate === undefined ? {} : { previousCandidate: input.previousCandidate }),
    ...(input.reviewIssues === undefined ? {} : { reviewIssues: input.reviewIssues }),
    ...(confirmedDialogueTimeline.length ? { confirmedDialogueTimeline } : {}),
  };
  const sourceKeys = availableSources(modelInput);
  const sourceSet = new Set(sourceKeys);
  const isRevision = input.previousCandidate !== undefined || input.reviewIssues !== undefined;
  return requestStructuredOutput(env, {
    schemaName: "shuokai_shared_understanding",
    schema: sourceRestrictedSchema(
      understandingResultSchema,
      sourceKeys,
    ) as unknown as Record<string, unknown>,
    systemText: [
      "你是‘说开’的互相理解 Agent。你的任务不是复述两张表达卡，而是找出双方经过真实复述与本人确认后，已经听懂了对方什么。你不裁判谁对谁错，也不提出行动方案。",
      "输入只包含双方本人确认并同意分享的表达卡。不得推断私人原话、人格、动机、诊断或关系结论。",
      "confirmedDialogueTimeline 是双方已共享的表达、复述、确认与回应。replyToSequence 表示这一条在回应哪一条。必须以较新的纠正和确认作为依据，不能只复述最初两张表达卡。",
      "mutualUnderstanding 必须恰好两项：A 听懂 B、B 听懂 A。每项都必须引用三类证据：原表达者的 OPENING/RESPONSE、倾听者的 REFLECTION、原表达者 decision=ACCURATE 的 REFLECTION_CONFIRMATION。没有这条完整证据链就不得声称已经听懂。",
      "mutualUnderstanding.text 要写对方真正希望被理解的含义，例如关心、影响、顾虑或边界；不要复制整段原话，不要写‘A 表示……；B 表示……’式会议纪要。",
      "newUnderstanding 只写交流后才变清楚的一层含义：被纠正的误读、行为背后的已确认顾虑，或双方终于能同时看见的关系。它必须只引用 DIALOGUE sources，并同时包含 A、B 的对话证据；不得照抄任一张初始表达卡。",
      "不同主张必须保留为 differences；未经双方确认的事实只能放进 unverifiedFacts。不要为了显得圆满制造共同点。",
      "边界只允许来自 boundary、acceptableRange、selfProtectiveAction 字段，或 confirmedDialogueTimeline 中某一方后来明确声明的边界；普通 request 绝不能写入 boundaries。边界必须原样保留其约束性。",
      "differences.sideA 和 sideB 必须写双方表达的自然语言摘要，绝不能填写 A.request、B.need 等字段名。",
      "同一项共同点、分歧、未核实事实或边界只能输出一次。相同 topic、sideA 和 sideB 的分歧必须合并，绝不能用换序或重复措辞凑满数组。",
      "任何摘要里出现观察、感受、需要或请求的内容，sources 都必须逐项包含对应字段；如果 sources 只写 observation，side 文本就绝不能顺带加入 feeling。",
      "unverifiedFacts 只收录输入中确实出现但仍有争议或不确定的事实，不得把输入未提及的细节包装成待核实事实。",
      "nextQuestion 必须是下一轮只需回答的一个具体问题，直接连接尚未解决的分歧，并同时回应双方已经确认的顾虑。禁止写‘如何更好沟通’等空泛问题。没有安全风险时 safetyDisposition 为 ALLOW 且 safetyMessage 必须为空字符串。",
      `本次允许引用的 sources 只有：${sourceKeys.join("、")}。绝不能引用列表之外或内容为空的字段。`,
      isRevision
        ? "这是唯一一次修订：必须逐条消除 reviewIssues。UNCONFIRMED_HEARING 必须回到准确确认的证据链；NO_UNDERSTANDING_GAIN 必须改写为对话后才清楚的含义；GENERIC_NEXT_QUESTION 必须收窄到一个可回答的问题。sources 必须精确，不确定就删掉不受支持的措辞。"
        : "这是初次候选，不包含修订指令。",
      "输出中文。",
    ].join("\n"),
    userData: modelInput,
    maxTokens: 2400,
    normalize: (value) => normalizeUnderstandingResult(
      withoutUnavailableBoundaries(value, sourceSet),
    ),
    validate: (value) => isUnderstandingResult(value) && usesOnlyAvailableSources(value, sourceSet) &&
      mutualEvidenceChainsAreConfirmed(value, confirmedDialogueTimeline),
  });
}

export function reviewSharedUnderstanding(env: WorkerEnv, input: {
  expressionA: ConfirmedExpression;
  expressionB: ConfirmedExpression;
  candidate: unknown;
  dialogueTimeline?: DialogueContext;
}) {
  const confirmedDialogueTimeline = sanitizedDialogueTimeline(input.dialogueTimeline);
  const modelInput = {
    expressionA: sanitizedConfirmedExpression(input.expressionA),
    expressionB: sanitizedConfirmedExpression(input.expressionB),
    candidate: input.candidate,
    ...(confirmedDialogueTimeline.length ? { confirmedDialogueTimeline } : {}),
  };
  const sourceKeys = availableSources(modelInput);
  const sourceSet = new Set(sourceKeys);
  return requestStructuredOutput(env, {
    schemaName: "shuokai_understanding_review",
    schema: sourceRestrictedSchema(
      understandingReviewSchema,
      sourceKeys,
    ) as unknown as Record<string, unknown>,
    systemText: [
      "你是独立的审查 Agent。不要重写候选，只判断它是否可以安全、忠实地展示给双方。",
      "逐项检查：每个结论是否有 sources 支持；双方是否真的分别完成了经本人确认准确的复述；newUnderstanding 是否比初始表达卡多出经过对话确认的新理解；nextQuestion 是否具体；以及是否制造虚假共识、把争议当真相、弱化边界或泄露未分享内容。",
      "mutualUnderstanding 每项必须能沿 replyToSequence 找到‘原表达—对方复述—原表达者确认 ACCURATE’的完整链。缺失、角色颠倒或只有 NEEDS_CORRECTION 时输出 UNCONFIRMED_HEARING。",
      "如果 newUnderstanding 只是把 expressionA 和 expressionB 连接、压缩或换词，没有使用后续对话形成的新含义，输出 NO_UNDERSTANDING_GAIN。即使摘要忠实，也不能 PASS。",
      "如果 nextQuestion 是‘如何沟通’‘怎样兼顾双方’这类无法直接回答的泛化问题，输出 GENERIC_NEXT_QUESTION。",
      "不能只看 sources 标签存在：必须把候选文本与对应输入字段逐字义对照；把双方不同观察拼成共同事实属于 FALSE_CONSENSUS。把普通请求列为边界属于 BOUNDARY_DILUTED。",
      "differences 中 sideA/sideB 明确分别归属双方的忠实摘要，不是把争议当真相；但忠实复述本身也不能替代互相理解证据和理解增量。",
      "没有实质问题才输出 PASS。UNSUPPORTED、UNCONFIRMED_HEARING、NO_UNDERSTANDING_GAIN、GENERIC_NEXT_QUESTION、FALSE_CONSENSUS、FACT_AS_TRUTH、BOUNDARY_DILUTED 都是可修订问题，必须输出 REVISE，safetyDisposition 保持 ALLOW。",
      "非阻断但确需提醒的安全语境可以使用 WARN 并提供 safetyMessage。只有确有 PRIVATE_LEAK，或输入本身显示胁迫、自伤、伤人等真实危险且对应 UNSAFE 时才输出 BLOCK_SHARE/PAUSE 与 BLOCK；不得把普通依据不足标成 UNSAFE。",
      "issues 必须具体且只引用输入中存在的稳定字段。没有真实安全风险时 safetyMessage 必须为空字符串。输出中文。",
      `本次允许引用的 sources 只有：${sourceKeys.join("、")}。`,
    ].join("\n"),
    userData: modelInput,
    model: REVIEW_MODEL,
    maxTokens: 1200,
    validate: (value) => isUnderstandingReview(value) && reviewUsesOnlyAvailableSources(value, sourceSet),
  });
}

async function processMessage(
  env: WorkerEnv,
  message: QueueMessageEnvelope,
  fallbackCorrelationId?: string,
): Promise<QueueResult> {
  const parsed = parseQueueMessage(message.body);
  if (!parsed) {
    message.ack();
    return { outcome: "discarded", errorCode: "INVALID_QUEUE_MESSAGE" };
  }
  const correlationId = parsed.correlationId ?? fallbackCorrelationId ?? crypto.randomUUID();
  const admin = adminClient(env);
  if (!admin) {
    message.ack();
    return { correlationId, outcome: "discarded", errorCode: "AI_SERVICE_NOT_CONFIGURED" };
  }
  const workerId = crypto.randomUUID();
  const { data: claim, error: claimError } = await admin.rpc("internal_claim_ai_job_v2", {
    p_job_id: parsed.jobId,
    p_worker_id: workerId,
  });
  if (claimError) {
    message.retry();
    return { correlationId, outcome: "retried", errorCode: "CLAIM_JOB_FAILED" };
  }
  if (!claim || typeof claim !== "object") {
    message.ack();
    return { correlationId, outcome: "discarded", errorCode: "INVALID_JOB_CLAIM" };
  }
  if (!(claim as { claimed?: unknown }).claimed) {
    const status = (claim as { status?: unknown }).status;
    if (status === "QUEUED" || status === "PROCESSING" || status === "FAILED_RETRYABLE") {
      message.retry();
      return { correlationId, outcome: "retried", errorCode: "JOB_NOT_READY" };
    }
    message.ack();
    return { correlationId, outcome: "discarded", errorCode: "JOB_NOT_ACTIONABLE" };
  }
  const input = claim as ClaimPayload | UnderstandingClaimPayload;
  try {
    let generated;
    let completionRpc: string;
    if (input.jobType === "UNDERSTAND") {
      if (!isSupportedExpressionMode(input.selectedMode) || typeof input.sourceText !== "string") {
        throw new Error("INVALID_JOB_INPUT");
      }
      generated = await generateExpressionCandidate(env, {
        mode: input.selectedMode,
        sourceText: input.sourceText,
      });
      completionRpc = "internal_complete_ai_job_v2";
    } else {
      if (!isConfirmedExpression(input.expressionA) || !isConfirmedExpression(input.expressionB) ||
        !Number.isSafeInteger(input.semanticAttempt) || input.semanticAttempt < 0 || input.semanticAttempt > 1) {
        throw new Error("INVALID_JOB_INPUT");
      }
      if (input.jobType === "CONSENSUS") {
        const { data: dialogueContext, error: dialogueError } = await admin.rpc(
          "internal_get_dialogue_context_v2",
          { p_job_id: parsed.jobId },
        );
        if (dialogueError || !Array.isArray(dialogueContext)) throw new Error("DIALOGUE_CONTEXT_FAILED");
        generated = await generateSharedUnderstanding(env, {
          expressionA: input.expressionA,
          expressionB: input.expressionB,
          previousCandidate: input.previousCandidate,
          reviewIssues: input.reviewIssues,
          dialogueTimeline: dialogueContext,
        });
        completionRpc = "internal_complete_consensus_job_v2";
      } else if (input.jobType === "REVIEW_UNDERSTANDING" && isUnderstandingResult(input.candidate)) {
        const { data: dialogueContext, error: dialogueError } = await admin.rpc(
          "internal_get_dialogue_context_v2",
          { p_job_id: parsed.jobId },
        );
        if (dialogueError || !Array.isArray(dialogueContext)) throw new Error("DIALOGUE_CONTEXT_FAILED");
        generated = await reviewSharedUnderstanding(env, {
          expressionA: input.expressionA,
          expressionB: input.expressionB,
          candidate: input.candidate,
          dialogueTimeline: dialogueContext,
        });
        completionRpc = "internal_complete_understanding_review_v2";
      } else {
        throw new Error("INVALID_JOB_INPUT");
      }
    }
    const { data: completed, error } = await admin.rpc(completionRpc, {
      p_job_id: parsed.jobId,
      p_worker_id: workerId,
      p_model_id: generated.model,
      p_result_payload: generated.result,
      p_provider_request_ref: generated.providerRequestRef,
      p_token_input: generated.tokenInput,
      p_token_output: generated.tokenOutput,
      p_latency_ms: generated.latencyMs,
    });
    if (error) throw new Error("COMPLETE_JOB_FAILED");
    const nextJobId = isRecord(completed) ? completed.nextJobId : null;
    if (typeof nextJobId === "string") {
      await env.AI_JOBS_QUEUE?.send({ jobId: nextJobId, correlationId });
    }
    message.ack();
    return { correlationId, outcome: "succeeded" };
  } catch (error) {
    const code = error instanceof Error ? error.message : "AI_UNKNOWN_ERROR";
    const retryable = code === "CLOUDFLARE_AI_RETRYABLE" || code === "COMPLETE_JOB_FAILED";
    await admin.rpc("internal_fail_ai_job_v2", {
      p_job_id: parsed.jobId,
      p_worker_id: workerId,
      p_error_code: code,
      p_retryable: retryable,
    });
    if (retryable) {
      message.retry();
      return { correlationId, outcome: "retried", errorCode: code };
    }
    message.ack();
    return { correlationId, outcome: "discarded", errorCode: code };
  }
}

export async function processExpressionQueue(batch: QueueBatch, env: WorkerEnv, sink?: LogSink) {
  const startedAt = Date.now();
  try {
    const results = await Promise.all(batch.messages.map(async (message) => {
      const messageStartedAt = Date.now();
      const parsed = parseQueueMessage(message.body);
      const correlationId = parsed ? parsed.correlationId ?? crypto.randomUUID() : undefined;
      try {
        const result = await processMessage(env, message, correlationId);
        logQueueMessage(env, { ...result, durationMs: Date.now() - messageStartedAt }, sink);
        return result;
      } catch {
        const result: QueueResult = {
          ...(correlationId ? { correlationId } : {}),
          outcome: "retried",
          errorCode: "AI_QUEUE_HANDLER_EXCEPTION",
        };
        logQueueMessage(env, { ...result, durationMs: Date.now() - messageStartedAt }, sink);
        message.retry();
        return result;
      }
    }));
    logQueueBatch(env, {
      batchSize: results.length,
      succeeded: results.filter((result) => result.outcome === "succeeded").length,
      retried: results.filter((result) => result.outcome === "retried").length,
      discarded: results.filter((result) => result.outcome === "discarded").length,
      durationMs: Date.now() - startedAt,
    }, sink);
  } catch (error) {
    logQueueBatch(env, {
      batchSize: batch.messages.length,
      succeeded: 0,
      retried: 0,
      discarded: 0,
      durationMs: Date.now() - startedAt,
      failed: true,
    }, sink);
    throw error;
  }
}
