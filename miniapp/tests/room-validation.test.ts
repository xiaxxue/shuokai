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
      invitationContext: {
        inviterName: "发起者",
        topic: "视频聊天时提到另一个女生好看",
        title: "关于视频聊天中的一句话",
        summary: "发起方想谈谈视频聊天时发生的一件事。",
        confirmedSummary: true,
        hiddenDraft: "不得进入房间状态",
      },
    };
    const snapshot = {
      room: {
        id: session.roomId,
        code: session.code,
        state: session.state,
        goal: "让我被准确理解",
      },
      me: { id: "participant-b", role: "B", display_name: "我" },
      participants: [
        { role: "A", display_name: "发起者", joined_at: "2026-08-13T10:00:00.000Z" },
        { role: "B", display_name: "我", joined_at: "2026-08-13T10:01:00.000Z" },
      ],
      privateDraft: null,
      ownPerspective: null,
      approvedPerspectives: [],
      sharedView: null,
      agreement: null,
    };

    expect(parseRoomSession(session).roomId).toBe(session.roomId);
    expect(parseRoomSession(session).invitationContext).not.toHaveProperty("hiddenDraft");
    expect(parseRoomSession({ ...session, workflowVersion: 2, phaseV2: "DIALOGUE" }).phaseV2)
      .toBe("DIALOGUE");
    expect(parseRoomSnapshot({ ...snapshot, invitationContext: session.invitationContext })
      .invitationContext?.title).toBe("关于视频聊天中的一句话");
  });

  it("rejects malformed successful responses before they reach page state", () => {
    expect(() => parseRoomSession({ roomId: "room", code: "SAY2026", role: "C" }))
      .toThrow("无效房间数据");
    expect(() => parseRoomSnapshot({ room: {}, me: {} }))
      .toThrow("无效房间数据");
    expect(() => parseRoomSession({
      roomId: "room",
      code: "SAY2026",
      role: "B",
      state: "B_DRAFTING",
      invitationContext: { inviterName: "", topic: "某件事" },
    })).toThrow("邀请说明格式无效");
    expect(() => parseStateResult({ state: "COMPLETED" }, ["A_DRAFTING"] as const))
      .toThrow("无效房间数据");
    expect(() => parseAcceptanceResult({ state: "COMPLETED", activated: "yes" }))
      .toThrow("无效房间数据");
  });
});
