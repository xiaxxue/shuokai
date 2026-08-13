import { roomStates, type RoomState } from "./room-state";
import type { Perspective, RoomSession, RoomSnapshot } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRoomState(value: unknown): value is RoomState {
  return typeof value === "string" && roomStates.includes(value as RoomState);
}

function isRole(value: unknown): value is RoomSession["role"] {
  return value === "A" || value === "B";
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isPerspective(value: unknown): value is Perspective {
  return isRecord(value) &&
    isText(value.fact) &&
    isText(value.meaning) &&
    isText(value.impact) &&
    isText(value.request);
}

function invalidResponse(): never {
  throw new Error("数据服务返回了无效房间数据，请稍后重试。");
}

export function parseRoomSession(value: unknown): RoomSession {
  if (!isRecord(value) ||
    !isText(value.roomId) ||
    !isText(value.code) ||
    !isRole(value.role) ||
    !isRoomState(value.state)
  ) invalidResponse();
  const workflowVersion = value.workflowVersion;
  if (workflowVersion !== undefined && workflowVersion !== 1 && workflowVersion !== 2) invalidResponse();
  const phaseV2 = value.phaseV2;
  if (phaseV2 !== undefined && ![
    "SETUP", "PRIVATE_EXPRESSION", "UNDERSTANDING_GENERATING", "UNDERSTANDING_CONFIRMING",
    "ACTION_GENERATING", "ACTION_CONFIRMING", "PAUSED", "COMPLETED", "ENDED",
  ].includes(String(phaseV2))) invalidResponse();
  return value as RoomSession;
}

export function parseRoomSnapshot(value: unknown): RoomSnapshot {
  if (!isRecord(value) || !isRecord(value.room) || !isRecord(value.me)) invalidResponse();
  const { room, me, participants, privateDraft, ownPerspective, approvedPerspectives, sharedView, agreement } = value;
  const validRoom = isText(room.id) && isText(room.code) && isRoomState(room.state) &&
    (room.goal === null || isText(room.goal));
  const validMe = isText(me.id) && isRole(me.role) && isText(me.display_name);
  const validParticipants = Array.isArray(participants) && participants.every((item) =>
    isRecord(item) && isRole(item.role) && isText(item.display_name) && isText(item.joined_at)
  );
  const validDraft = privateDraft === null || (
    isRecord(privateDraft) && isText(privateDraft.transcript) &&
    (privateDraft.clarification === null || isText(privateDraft.clarification))
  );
  const validApproved = Array.isArray(approvedPerspectives) && approvedPerspectives.every((item) =>
    isRecord(item) && isRole(item.role) && isPerspective(item)
  );
  const validSharedView = sharedView === null || (
    isRecord(sharedView) && isText(sharedView.common_ground) &&
    isText(sharedView.disagreement) && isText(sharedView.core_question)
  );
  const validAgreement = agreement === null || (
    isRecord(agreement) && isText(agreement.id) && isText(agreement.proposal) &&
    isText(agreement.review_at) && typeof agreement.accepted_a === "boolean" &&
    typeof agreement.accepted_b === "boolean" &&
    (agreement.activated_at === null || isText(agreement.activated_at)) &&
    isText(agreement.created_at)
  );
  if (!validRoom || !validMe || !validParticipants || !validDraft ||
    (ownPerspective !== null && !isPerspective(ownPerspective)) ||
    !validApproved || !validSharedView || !validAgreement
  ) invalidResponse();
  return value as RoomSnapshot;
}

export function parseStateResult<T extends RoomState>(value: unknown, allowed: readonly T[]) {
  if (!isRecord(value) || !isRoomState(value.state) || !allowed.includes(value.state as T)) {
    invalidResponse();
  }
  return { state: value.state as T };
}

export function parseApprovalResult(value: unknown) {
  const result = parseStateResult(value, ["WAITING_FOR_B", "COMMON_VIEW_READY"] as const);
  if (!isRecord(value) || typeof value.version !== "number") invalidResponse();
  return { ...result, version: value.version };
}

export function parseAcceptanceResult(value: unknown) {
  const result = parseStateResult(value, ["AGREEMENT_PENDING", "COMPLETED"] as const);
  if (!isRecord(value) || typeof value.activated !== "boolean") invalidResponse();
  return { ...result, activated: value.activated };
}
