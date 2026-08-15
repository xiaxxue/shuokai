export type RoomEntryOutcome<T, U> = {
  room: T;
  followup: U | null;
  rememberError: unknown | null;
  followupError: unknown | null;
};

export async function runCommittedRoomEntry<T, U>(
  commitMembership: () => Promise<T>,
  rememberCommittedRoom: (room: T) => void,
  loadFollowup: (room: T) => Promise<U>,
): Promise<RoomEntryOutcome<T, U>> {
  const room = await commitMembership();
  let rememberError: unknown | null = null;
  try {
    rememberCommittedRoom(room);
  } catch (error) {
    rememberError = error;
  }
  try {
    return { room, followup: await loadFollowup(room), rememberError, followupError: null };
  } catch (error) {
    return { room, followup: null, rememberError, followupError: error };
  }
}
