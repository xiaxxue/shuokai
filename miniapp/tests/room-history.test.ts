import { describe, expect, it } from "vitest";
import { parseRoomHistoryPage, roomSessionFromHistory } from "../src/domain/room-history";

const item = {
  roomId: "71000000-0000-4000-8000-000000000001",
  code: "HIST2AB",
  state: "COMMON_VIEW_READY",
  goal: "先听懂彼此",
  topic: "提醒睡觉时产生的压力",
  workflowVersion: 2,
  phaseV2: "DIALOGUE",
  dialogueRound: 2,
  role: "A",
  participantCount: 2,
  createdAt: "2026-08-10T10:00:00.000Z",
  updatedAt: "2026-08-14T10:00:00.000Z",
  expiresAt: "2026-08-24T10:00:00.000Z",
} as const;

describe("room history boundary", () => {
  it("parses a bounded page and restores an authoritative room session", () => {
    const page = parseRoomHistoryPage({
      items: [item],
      hasMore: true,
      nextCursor: { updatedAt: item.updatedAt, roomId: item.roomId },
    });
    expect(roomSessionFromHistory(page.items[0])).toMatchObject({
      roomId: item.roomId,
      phaseV2: "DIALOGUE",
      role: "A",
    });
  });

  it("rejects internal ids, invalid counts, and inconsistent cursors", () => {
    expect(() => parseRoomHistoryPage({ items: [{ ...item, participantCount: 3 }], hasMore: false, nextCursor: null }))
      .toThrow("历史沟通数据格式无效");
    expect(() => parseRoomHistoryPage({ items: [{ ...item, topic: "话".repeat(181) }], hasMore: false, nextCursor: null }))
      .toThrow("历史沟通数据格式无效");
    expect(() => parseRoomHistoryPage({ items: [item], hasMore: true, nextCursor: null }))
      .toThrow("历史沟通分页状态无效");
  });
});
