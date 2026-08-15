import type { AuthSession, Perspective, RoomSession } from "../domain/types";
import {
  expressionModes,
  parseAiExpressionCandidate,
  type EditableExpression,
  type ExpressionMode,
} from "../domain/expression";
import { isEditorClientStage, roomStates, type ClientStage } from "../domain/room-state";
import {
  sanitizeClarificationTurns,
  type ClarificationTurn,
} from "../domain/clarification";

const SESSION_KEY = "shuokai.session.v2";
const ACTIVE_ROOM_KEY = "shuokai.active-room.v1";
const ACTIVE_ROOM_OWNER_KEY = "shuokai.active-room-owner.v1";
const EDITOR_DRAFT_KEY = "shuokai.editor-draft.v1";
const INVITATION_ACKNOWLEDGEMENTS_KEY = "shuokai.invitation-acknowledgements.v1";
const roomIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roomCodePattern = /^[A-Z0-9]{7}$/;

export type EditorDraft = {
  roomId: string;
  role: RoomSession["role"];
  transcript: string;
  clarification: string;
  perspective: Perspective;
  editorStage?: ClientStage;
  selectedMode?: ExpressionMode | null;
  editableExpression?: EditableExpression;
  workspaceRevision?: number;
  aiJobId?: string;
  clarificationTurns?: ClarificationTurn[];
  clarificationAnswer?: string;
  clarificationSkipped?: boolean;
  discoveryStarted?: boolean;
  discoveryQuestion?: string;
  discoveryReady?: boolean;
  discoverySafetyDisposition?: EditableExpression["safetyDisposition"];
  discoverySafetyMessage?: string;
};

export function getSession(): AuthSession | null {
  return (uni.getStorageSync(SESSION_KEY) as AuthSession | null) || null;
}

export function saveSession(session: AuthSession) {
  uni.setStorageSync(SESSION_KEY, session);
}

export function clearSession() {
  uni.removeStorageSync(SESSION_KEY);
}

export function getActiveRoom(ownerUserId?: string): RoomSession | null {
  const storedOwner: unknown = uni.getStorageSync(ACTIVE_ROOM_OWNER_KEY);
  if (ownerUserId && storedOwner !== ownerUserId) return null;
  const value: unknown = uni.getStorageSync(ACTIVE_ROOM_KEY);
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RoomSession>;
  if (
    typeof candidate.roomId !== "string" || !roomIdPattern.test(candidate.roomId) ||
    typeof candidate.code !== "string" || !roomCodePattern.test(candidate.code) ||
    (candidate.role !== "A" && candidate.role !== "B") ||
    (candidate.workflowVersion !== undefined && candidate.workflowVersion !== 1 && candidate.workflowVersion !== 2) ||
    (candidate.phaseV2 !== undefined && ![
      "SETUP", "PRIVATE_EXPRESSION", "DIALOGUE", "UNDERSTANDING_GENERATING", "UNDERSTANDING_CONFIRMING",
      "ACTION_GENERATING", "ACTION_CONFIRMING", "PAUSED", "COMPLETED", "ENDED",
    ].includes(candidate.phaseV2)) ||
    !roomStates.includes(candidate.state as RoomSession["state"])
  ) return null;
  return candidate as RoomSession;
}

export function saveActiveRoom(room: RoomSession, ownerUserId?: string) {
  uni.setStorageSync(ACTIVE_ROOM_KEY, room);
  if (ownerUserId) uni.setStorageSync(ACTIVE_ROOM_OWNER_KEY, ownerUserId);
}

export function clearActiveRoom() {
  uni.removeStorageSync(ACTIVE_ROOM_KEY);
  uni.removeStorageSync(ACTIVE_ROOM_OWNER_KEY);
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

export function getEditorDraft(roomId: string, role: RoomSession["role"]): EditorDraft | null {
  const value: unknown = uni.getStorageSync(EDITOR_DRAFT_KEY);
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<EditorDraft>;
  const cards = candidate.perspective as Partial<Perspective> | undefined;
  if (
    candidate.roomId !== roomId || candidate.role !== role ||
    !roomIdPattern.test(roomId) ||
    !isBoundedText(candidate.transcript, 12000) ||
    !isBoundedText(candidate.clarification, 3000) ||
    (candidate.editorStage !== undefined && !isEditorClientStage(candidate.editorStage)) ||
    !cards ||
    !isBoundedText(cards.fact, 1000) ||
    !isBoundedText(cards.meaning, 1000) ||
    !isBoundedText(cards.impact, 1000) ||
    !isBoundedText(cards.request, 1000)
  ) return null;
  const migratedMeaning = cards.meaning.trim()
    ? cards.meaning
    : candidate.clarification.trim().slice(0, 1000);
  let selectedMode: ExpressionMode | null | undefined;
  let editableExpression: EditableExpression | undefined;
  if (candidate.selectedMode === null) selectedMode = null;
  else if (expressionModes.includes(candidate.selectedMode as ExpressionMode)) {
    selectedMode = candidate.selectedMode as ExpressionMode;
  }
  if (selectedMode && candidate.editableExpression) {
    try {
      editableExpression = parseAiExpressionCandidate(candidate.editableExpression, selectedMode);
    } catch {
      editableExpression = undefined;
    }
  }
  const workspaceRevision = typeof candidate.workspaceRevision === "number" &&
    Number.isSafeInteger(candidate.workspaceRevision) && candidate.workspaceRevision >= 0
    ? candidate.workspaceRevision
    : undefined;
  const aiJobId = typeof candidate.aiJobId === "string" && roomIdPattern.test(candidate.aiJobId)
    ? candidate.aiJobId
    : undefined;
  const clarificationTurns = candidate.clarificationTurns === undefined
    ? undefined
    : sanitizeClarificationTurns(candidate.clarificationTurns);
  const clarificationAnswer = isBoundedText(candidate.clarificationAnswer, 1200)
    ? candidate.clarificationAnswer
    : undefined;
  const clarificationSkipped = typeof candidate.clarificationSkipped === "boolean"
    ? candidate.clarificationSkipped
    : undefined;
  const discoveryStarted = typeof candidate.discoveryStarted === "boolean"
    ? candidate.discoveryStarted
    : undefined;
  const discoveryQuestion = isBoundedText(candidate.discoveryQuestion, 500)
    ? candidate.discoveryQuestion
    : undefined;
  const discoveryReady = typeof candidate.discoveryReady === "boolean"
    ? candidate.discoveryReady
    : undefined;
  const discoverySafetyDisposition = ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"]
    .includes(String(candidate.discoverySafetyDisposition))
    ? candidate.discoverySafetyDisposition
    : undefined;
  const discoverySafetyMessage = isBoundedText(candidate.discoverySafetyMessage, 1000)
    ? candidate.discoverySafetyMessage
    : undefined;
  return {
    roomId: candidate.roomId,
    role: candidate.role,
    transcript: candidate.transcript,
    clarification: candidate.clarification,
    perspective: {
      fact: cards.fact,
      meaning: migratedMeaning,
      impact: cards.impact,
      request: cards.request,
    },
    ...(candidate.editorStage ? { editorStage: candidate.editorStage } : {}),
    ...(selectedMode !== undefined ? { selectedMode } : {}),
    ...(editableExpression ? { editableExpression } : {}),
    ...(workspaceRevision !== undefined ? { workspaceRevision } : {}),
    ...(aiJobId ? { aiJobId } : {}),
    ...(clarificationTurns !== undefined ? { clarificationTurns } : {}),
    ...(clarificationAnswer !== undefined ? { clarificationAnswer } : {}),
    ...(clarificationSkipped !== undefined ? { clarificationSkipped } : {}),
    ...(discoveryStarted !== undefined ? { discoveryStarted } : {}),
    ...(discoveryQuestion !== undefined ? { discoveryQuestion } : {}),
    ...(discoveryReady !== undefined ? { discoveryReady } : {}),
    ...(discoverySafetyDisposition !== undefined ? { discoverySafetyDisposition } : {}),
    ...(discoverySafetyMessage !== undefined ? { discoverySafetyMessage } : {}),
  };
}

export function saveEditorDraft(draft: EditorDraft) {
  uni.setStorageSync(EDITOR_DRAFT_KEY, draft);
}

export function clearEditorDraft() {
  uni.removeStorageSync(EDITOR_DRAFT_KEY);
}

function invitationAcknowledgements() {
  const value: unknown = uni.getStorageSync(INVITATION_ACKNOWLEDGEMENTS_KEY);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string =>
    typeof item === "string" && roomIdPattern.test(item)
  ).slice(-20);
}

export function hasAcknowledgedInvitation(roomId: string) {
  return roomIdPattern.test(roomId) && invitationAcknowledgements().includes(roomId);
}

export function acknowledgeInvitation(roomId: string) {
  if (!roomIdPattern.test(roomId)) return;
  const next = [...new Set([...invitationAcknowledgements(), roomId])].slice(-20);
  uni.setStorageSync(INVITATION_ACKNOWLEDGEMENTS_KEY, next);
}

export function clearPrivateDeviceData() {
  clearActiveRoom();
  clearEditorDraft();
  uni.removeStorageSync(INVITATION_ACKNOWLEDGEMENTS_KEY);
}
