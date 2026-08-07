import { describe, expect, it } from "vitest";
import {
  parseAcceptanceResult,
  parseRoomSession,
  parseRoomSnapshot,
  parseStateResult,
} from "../src/domain/room-validation";
import { createMockApi } from "../src/services/mock-api";

describe("room API response validation", () => {
  it("accepts valid room sessions and snapshots", () => {
    const session = {
      roomId: "11111111-1111-4111-8111-111111111111",
      code: "SAY2026",
      role: "B" as const,
      state: "COMMON_VIEW_READY" as const,
    };
    const mock = createMockApi(session);

    expect(parseRoomSession(session)).toEqual(session);
    expect(parseRoomSnapshot(mock.snapshot()).room.state).toBe("COMMON_VIEW_READY");
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
