import { describe, expect, it } from "vitest";
import {
  parseAcceptanceResult,
  parseRoomSession,
  parseRoomSnapshot,
  parseStateResult,
} from "../src/domain/room-validation";

describe("room API response validation", () => {
  it("accepts valid room sessions and snapshots", () => {
    const session = {
      roomId: "11111111-1111-4111-8111-111111111111",
      code: "SAY2026",
      role: "B" as const,
      state: "COMMON_VIEW_READY" as const,
    };
    const snapshot = {
      room: {
        id: session.roomId,
        code: session.code,
        state: session.state,
        goal: "让我被准确理解",
      },
      me: { id: "participant-b", role: "B", display_name: "我" },
      privateDraft: null,
      ownPerspective: null,
      approvedPerspectives: [],
      sharedView: null,
      agreement: null,
    };

    expect(parseRoomSession(session)).toEqual(session);
    expect(parseRoomSnapshot(snapshot).room.state).toBe("COMMON_VIEW_READY");
  });

  it("rejects malformed successful responses before they reach page state", () => {
    expect(() => parseRoomSession({ roomId: "room", code: "SAY2026", role: "C" }))
      .toThrow("无效房间数据");
    expect(() => parseRoomSnapshot({ room: {}, me: {} }))
      .toThrow("无效房间数据");
    expect(() => parseStateResult({ state: "COMPLETED" }, ["A_DRAFTING"] as const))
      .toThrow("无效房间数据");
    expect(() => parseAcceptanceResult({ state: "COMPLETED", activated: "yes" }))
      .toThrow("无效房间数据");
  });
});
