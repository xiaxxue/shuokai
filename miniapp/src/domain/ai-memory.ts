import {
  parseDiscoveryUnderstandingState,
  sanitizeClarificationTurns,
  type ClarificationTurn,
  type DiscoveryUnderstandingState,
} from "./clarification";
import type { SafetyDisposition } from "./expression";
import type { RoomSession } from "./types";
import { roomStates } from "./room-state";

export const personalMemoryKinds = [
  "NEED", "TRIGGER", "PREFERENCE", "BOUNDARY", "REPAIR_PATTERN",
] as const;
export type PersonalMemoryKind = typeof personalMemoryKinds[number];
export type PersonalMemoryStatus = "PROPOSED" | "CONFIRMED";

export type PersonalMemoryItem = {
  id: string;
  kind: PersonalMemoryKind;
  content: string;
  reason: string;
  status: PersonalMemoryStatus;
  roomId?: string;
  roomCode?: string;
  topic?: string;
  updatedAt?: string;
};

export type RelationshipMemoryItem = {
  id: string;
  kind: "NEW_UNDERSTANDING" | "RECURRING_ISSUE" | "OPEN_ISSUE";
  content: string;
  status: "PROPOSED" | "ACTIVE" | "REVOKED";
  sourceValid: boolean;
  myDecision: "REMEMBER" | "DECLINE" | null;
  partnerDecision: "REMEMBER" | "DECLINE" | null;
  roomId: string;
  roomCode: string;
  topic: string;
  updatedAt: string;
};

export type AiConversationHistoryItem = {
  roomId: string;
  roomCode: string;
  role: "A" | "B";
  state: RoomSession["state"];
  workflowVersion: 2;
  phaseV2?: RoomSession["phaseV2"];
  topic: string;
  summary: string;
  ready: boolean;
  updatedAt: string;
};

export type AiPrivateConversation = {
  revision: number;
  sourceText: string;
  turns: ClarificationTurn[];
  question: string;
  ready: boolean;
  understanding: DiscoveryUnderstandingState | null;
  safetyDisposition: SafetyDisposition;
  safetyMessage: string;
  summary: string;
  updatedAt: string;
  memoryProposals: PersonalMemoryItem[];
};

export type DetachedDiscoveryDraft = {
  answer: string;
  question: string;
  revision: number;
};

export type AiMemoryCollection = {
  personal: PersonalMemoryItem[];
  relationship: RelationshipMemoryItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, max: number) {
  return typeof value === "string" && value.length <= max ? value : "";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const roomPhases = [
  "SETUP", "PRIVATE_EXPRESSION", "DIALOGUE", "UNDERSTANDING_GENERATING",
  "UNDERSTANDING_CONFIRMING", "ACTION_GENERATING", "ACTION_CONFIRMING",
  "PAUSED", "COMPLETED", "ENDED",
] as const;

function parsePersonalMemory(value: unknown): PersonalMemoryItem | null {
  if (!isRecord(value) || !isUuid(value.id) ||
    !personalMemoryKinds.includes(value.kind as PersonalMemoryKind) ||
    !["PROPOSED", "CONFIRMED"].includes(String(value.status)) ||
    typeof value.content !== "string" || !value.content.trim() || value.content.length > 600 ||
    typeof value.reason !== "string" || value.reason.length > 600) return null;
  return {
    id: value.id,
    kind: value.kind as PersonalMemoryKind,
    content: value.content,
    reason: value.reason,
    status: value.status as PersonalMemoryStatus,
    ...(isUuid(value.roomId) ? { roomId: value.roomId } : {}),
    ...(typeof value.roomCode === "string" ? { roomCode: value.roomCode } : {}),
    ...(typeof value.topic === "string" ? { topic: value.topic } : {}),
    ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}),
  };
}

export function parseAiPrivateConversation(value: unknown): AiPrivateConversation {
  if (!isRecord(value)) throw new Error("私人对话返回格式无效。");
  const revision = Number(value.revision);
  const turns = sanitizeClarificationTurns(value.turns);
  const understanding = value.understanding === null
    ? null
    : parseDiscoveryUnderstandingState(value.understanding);
  const dispositions = ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"] as const;
  const proposals = Array.isArray(value.memoryProposals)
    ? value.memoryProposals.map(parsePersonalMemory).filter((item): item is PersonalMemoryItem => Boolean(item))
    : [];
  if (!Number.isSafeInteger(revision) || revision < 0 ||
    (value.understanding !== null && understanding === null) ||
    typeof value.ready !== "boolean" ||
    !dispositions.includes(value.safetyDisposition as typeof dispositions[number])) {
    throw new Error("私人对话返回格式无效。");
  }
  return {
    revision,
    sourceText: boundedString(value.sourceText, 12000),
    turns,
    question: boundedString(value.question, 500),
    ready: value.ready,
    understanding,
    safetyDisposition: value.safetyDisposition as SafetyDisposition,
    safetyMessage: boundedString(value.safetyMessage, 1000),
    summary: boundedString(value.summary, 600),
    updatedAt: boundedString(value.updatedAt, 80),
    memoryProposals: proposals,
  };
}

export function parseAiConversationHistory(value: unknown): AiConversationHistoryItem[] {
  if (!Array.isArray(value)) throw new Error("AI 对话历史返回格式无效。");
  return value.map((item) => {
    if (!isRecord(item) || !isUuid(item.roomId) || typeof item.roomCode !== "string" ||
      !["A", "B"].includes(String(item.role)) ||
      !roomStates.includes(item.state as RoomSession["state"]) ||
      item.workflowVersion !== 2 || typeof item.topic !== "string" ||
      typeof item.summary !== "string" || typeof item.ready !== "boolean" ||
      typeof item.updatedAt !== "string" ||
      (item.phaseV2 !== undefined && !roomPhases.includes(item.phaseV2 as typeof roomPhases[number]))) {
      throw new Error("AI 对话历史返回格式无效。");
    }
    return item as AiConversationHistoryItem;
  });
}

export function parseAiMemories(value: unknown): AiMemoryCollection {
  if (!isRecord(value) || !Array.isArray(value.personal) || !Array.isArray(value.relationship)) {
    throw new Error("AI 记忆返回格式无效。");
  }
  const personal = value.personal.map(parsePersonalMemory)
    .filter((item): item is PersonalMemoryItem => Boolean(item));
  const relationship = value.relationship.map((item) => {
    if (!isRecord(item) || !isUuid(item.id) ||
      !["NEW_UNDERSTANDING", "RECURRING_ISSUE", "OPEN_ISSUE"].includes(String(item.kind)) ||
      !["PROPOSED", "ACTIVE", "REVOKED"].includes(String(item.status)) ||
      typeof item.sourceValid !== "boolean" ||
      ![null, "REMEMBER", "DECLINE"].includes(item.myDecision as null | string) ||
      ![null, "REMEMBER", "DECLINE"].includes(item.partnerDecision as null | string) ||
      typeof item.content !== "string" || !item.content.trim() ||
      !isUuid(item.roomId) || typeof item.roomCode !== "string" ||
      typeof item.topic !== "string" || typeof item.updatedAt !== "string") return null;
    return item as RelationshipMemoryItem;
  }).filter((item): item is RelationshipMemoryItem => Boolean(item));
  return { personal, relationship };
}

export const personalMemoryKindLabel: Record<PersonalMemoryKind, string> = {
  NEED: "在意的需要",
  TRIGGER: "容易被触发的情境",
  PREFERENCE: "沟通偏好",
  BOUNDARY: "需要守住的边界",
  REPAIR_PATTERN: "有效的修复方式",
};

export const relationshipMemoryKindLabel: Record<RelationshipMemoryItem["kind"], string> = {
  NEW_UNDERSTANDING: "双方新听懂的事",
  RECURRING_ISSUE: "仍需面对的分歧",
  OPEN_ISSUE: "还没解决的问题",
};
