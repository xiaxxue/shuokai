import type {
  ParticipantContextDraft,
  ProfileDraft,
  RoomRelationshipContext,
  SharedContextDraft,
} from "../domain/profile-context";
import type { RoomSession } from "../domain/types";

const PROFILE_PREFIX = "shuokai.profile-draft.v1:";
const ROOM_PREFIX = "shuokai.relationship-draft.v1:";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RelationshipDraft = {
  step: number;
  decision?: "CONFIRMED" | "DIFFERENT" | "SKIPPED";
  shared: SharedContextDraft;
  mine: ParticipantContextDraft;
  sharedRevision: number;
  privateRevision: number;
};

function profileKey(userId: string) {
  return `${PROFILE_PREFIX}${userId}`;
}

function roomKey(userId: string, roomId: string, role: RoomSession["role"]) {
  return `${ROOM_PREFIX}${userId}:${roomId}:${role}`;
}

function bounded(value: unknown, max: number) {
  return typeof value === "string" && value.length <= max;
}

export function saveProfileDraft(userId: string, draft: ProfileDraft) {
  if (!uuidPattern.test(userId)) return;
  uni.setStorageSync(profileKey(userId), draft);
}

export function getProfileDraft(userId: string): ProfileDraft | null {
  if (!uuidPattern.test(userId)) return null;
  const value: unknown = uni.getStorageSync(profileKey(userId));
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<ProfileDraft>;
  if (!bounded(item.displayName, 30) || !bounded(item.language, 30) && item.language !== null ||
    ![null, "SHORT", "BALANCED", "DETAILED"].includes(item.responseLength ?? null) ||
    typeof item.useResponseLengthAi !== "boolean" || typeof item.useLanguageAi !== "boolean") return null;
  return item as ProfileDraft;
}

export function clearProfileDraft(userId: string) {
  uni.removeStorageSync(profileKey(userId));
}

export function saveRelationshipDraft(
  userId: string,
  roomId: string,
  role: RoomSession["role"],
  draft: RelationshipDraft,
) {
  if (!uuidPattern.test(userId) || !uuidPattern.test(roomId)) return;
  uni.setStorageSync(roomKey(userId, roomId, role), draft);
}

export function getRelationshipDraft(
  userId: string,
  roomId: string,
  role: RoomSession["role"],
): RelationshipDraft | null {
  if (!uuidPattern.test(userId) || !uuidPattern.test(roomId)) return null;
  const value: unknown = uni.getStorageSync(roomKey(userId, roomId, role));
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<RelationshipDraft>;
  if (!Number.isSafeInteger(item.step) || Number(item.step) < 1 || Number(item.step) > 4 ||
    !item.shared || !item.mine || !Number.isSafeInteger(item.sharedRevision) ||
    Number(item.sharedRevision) < 0 || !Number.isSafeInteger(item.privateRevision) ||
    Number(item.privateRevision) < 0) return null;
  return item as RelationshipDraft;
}

export function clearRelationshipDraft(userId: string, roomId: string, role: RoomSession["role"]) {
  uni.removeStorageSync(roomKey(userId, roomId, role));
}

export function rebaseRelationshipDraft(
  draft: RelationshipDraft,
  latest: RoomRelationshipContext,
): RelationshipDraft {
  return {
    ...draft,
    sharedRevision: latest.shared.revision,
    privateRevision: latest.mine.revision,
  };
}

export function clearProfileContextDraftsForUser(userId: string) {
  if (!uuidPattern.test(userId)) return;
  const keys = uni.getStorageInfoSync().keys;
  for (const key of keys) {
    if (key === profileKey(userId) || key.startsWith(`${ROOM_PREFIX}${userId}:`)) {
      uni.removeStorageSync(key);
    }
  }
}

export function discardForeignProfileContextDrafts(activeUserId: string) {
  const keys = uni.getStorageInfoSync().keys;
  for (const key of keys) {
    if (key.startsWith(PROFILE_PREFIX) && key !== profileKey(activeUserId) ||
      key.startsWith(ROOM_PREFIX) && !key.startsWith(`${ROOM_PREFIX}${activeUserId}:`)) {
      uni.removeStorageSync(key);
    }
  }
}
