import type { AuthSession, Perspective, RoomSession } from "../domain/types";
import { roomStates } from "../domain/room-state";

const SESSION_KEY = "shuokai.session.v2";
const ACTIVE_ROOM_KEY = "shuokai.active-room.v1";
const ACTIVE_ROOM_OWNER_KEY = "shuokai.active-room-owner.v1";
const EDITOR_DRAFT_KEY = "shuokai.editor-draft.v1";
const roomIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roomCodePattern = /^[A-Z0-9]{7}$/;

export type EditorDraft = {
  roomId: string;
  role: RoomSession["role"];
  transcript: string;
  clarification: string;
  perspective: Perspective;
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
    !cards ||
    !isBoundedText(cards.fact, 1000) ||
    !isBoundedText(cards.meaning, 1000) ||
    !isBoundedText(cards.impact, 1000) ||
    !isBoundedText(cards.request, 1000)
  ) return null;
  return candidate as EditorDraft;
}

export function saveEditorDraft(draft: EditorDraft) {
  uni.setStorageSync(EDITOR_DRAFT_KEY, draft);
}

export function clearEditorDraft() {
  uni.removeStorageSync(EDITOR_DRAFT_KEY);
}

export function clearPrivateDeviceData() {
  clearActiveRoom();
  clearEditorDraft();
}
