import { describe, expect, it } from "vitest";
import type { RoomSnapshot } from "../src/domain/types";
import { createMockApi } from "../src/services/mock-api";

describe("mock agreement consent", () => {
  it("requires the participant and simulated partner to accept independently", () => {
    const mock = createMockApi({
      roomId: "11111111-1111-4111-8111-111111111111",
      code: "SAY2026",
      role: "B",
      state: "COMMON_VIEW_READY",
    });

    mock.call("propose_agreement", {
      p_room_id: "11111111-1111-4111-8111-111111111111",
      p_proposal: "先同步待定状态",
      p_review_at: "2026-08-14T12:00:00.000Z",
    });
    expect(mock.snapshot().agreement).toMatchObject({
      accepted_a: false,
      accepted_b: false,
    });

    expect(mock.call("accept_agreement", {})).toEqual({
      state: "AGREEMENT_PENDING",
      activated: false,
    });
    expect(mock.snapshot().agreement).toMatchObject({
      accepted_a: false,
      accepted_b: true,
    });

    expect(mock.simulatePartnerAcceptance()).toEqual({
      state: "COMPLETED",
      activated: true,
    });
    expect(mock.call<RoomSnapshot>("get_room_snapshot", {}).room.state).toBe("COMPLETED");
  });
});
