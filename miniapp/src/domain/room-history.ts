import { roomStates, type RoomState } from "./room-state";
import type { RoomSession } from "./types";

export type RoomHistoryCursor = {
  updatedAt: string;
  roomId: string;
};

export type RoomHistoryItem = {
  roomId: string;
  code: string;
  state: RoomState;
  goal: string | null;
  workflowVersion: 1 | 2;
  phaseV2: RoomSession["phaseV2"] | null;
  dialogueRound: number;
  role: "A" | "B";
  participantCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type RoomHistoryPage = {
  items: RoomHistoryItem[];
  hasMore: boolean;
  nextCursor: RoomHistoryCursor | null;
};

const roomIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roomCodePattern = /^[A-Z2-9]{7}$/;
const phaseValues: Array<NonNullable<RoomSession["phaseV2"]>> = [
  "SETUP",
  "PRIVATE_EXPRESSION",
  "UNDERSTANDING_GENERATING",
  "UNDERSTANDING_CONFIRMING",
  "DIALOGUE",
  "ACTION_GENERATING",
  "ACTION_CONFIRMING",
  "PAUSED",
  "COMPLETED",
  "ENDED",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateText(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parseCursor(value: unknown): RoomHistoryCursor | null {
  if (value === null) return null;
  if (!isRecord(value) || !isDateText(value.updatedAt) ||
    typeof value.roomId !== "string" || !roomIdPattern.test(value.roomId)) {
    throw new Error("历史沟通数据格式无效，请稍后重试。");
  }
  return { updatedAt: value.updatedAt, roomId: value.roomId };
}

function parseItem(value: unknown): RoomHistoryItem {
  if (!isRecord(value) ||
    typeof value.roomId !== "string" || !roomIdPattern.test(value.roomId) ||
    typeof value.code !== "string" || !roomCodePattern.test(value.code) ||
    !roomStates.includes(value.state as RoomState) ||
    (value.goal !== null && typeof value.goal !== "string") ||
    (value.workflowVersion !== 1 && value.workflowVersion !== 2) ||
    (value.phaseV2 !== null && !phaseValues.includes(value.phaseV2 as NonNullable<RoomSession["phaseV2"]>)) ||
    !Number.isSafeInteger(value.dialogueRound) || Number(value.dialogueRound) < 0 ||
    (value.role !== "A" && value.role !== "B") ||
    !Number.isSafeInteger(value.participantCount) || Number(value.participantCount) < 1 || Number(value.participantCount) > 2 ||
    !isDateText(value.createdAt) || !isDateText(value.updatedAt) || !isDateText(value.expiresAt)) {
    throw new Error("历史沟通数据格式无效，请稍后重试。");
  }
  return value as RoomHistoryItem;
}

export function parseRoomHistoryPage(value: unknown): RoomHistoryPage {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 30 ||
    typeof value.hasMore !== "boolean") {
    throw new Error("历史沟通数据格式无效，请稍后重试。");
  }
  const nextCursor = parseCursor(value.nextCursor);
  if (value.hasMore !== Boolean(nextCursor)) {
    throw new Error("历史沟通分页状态无效，请稍后重试。");
  }
  return {
    items: value.items.map(parseItem),
    hasMore: value.hasMore,
    nextCursor,
  };
}

export function roomSessionFromHistory(item: RoomHistoryItem): RoomSession {
  return {
    roomId: item.roomId,
    code: item.code,
    role: item.role,
    state: item.state,
    workflowVersion: item.workflowVersion,
    phaseV2: item.phaseV2 ?? undefined,
  };
}
