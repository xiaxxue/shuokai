import type { AuthSession, RoomSession } from "../domain/types";
import { roomStates } from "../domain/room-state";

const SESSION_KEY = "shuokai.session.v2";
const ACTIVE_ROOM_KEY = "shuokai.active-room.v1";
const roomIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roomCodePattern = /^[A-Z0-9]{7}$/;

export function getSession(): AuthSession | null {
  return (uni.getStorageSync(SESSION_KEY) as AuthSession | null) || null;
}

export function saveSession(session: AuthSession) {
  uni.setStorageSync(SESSION_KEY, session);
}

export function clearSession() {
  uni.removeStorageSync(SESSION_KEY);
}

export function getActiveRoom(): RoomSession | null {
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

export function saveActiveRoom(room: RoomSession) {
  uni.setStorageSync(ACTIVE_ROOM_KEY, room);
}

export function clearActiveRoom() {
  uni.removeStorageSync(ACTIVE_ROOM_KEY);
}
