import type { Agreement, RoomSession, RoomSnapshot } from "../domain/types";

type RpcArgs = Record<string, string | number | boolean | null>;

const defaultRoom: RoomSession = {
  roomId: "11111111-1111-4111-8111-111111111111",
  code: "SAY2026",
  role: "A",
  state: "GOAL_SETTING",
};

export function createMockApi(initialRoom: RoomSession = defaultRoom) {
  let room = { ...initialRoom };
  let agreement: Agreement | null = null;

  function snapshot(): RoomSnapshot {
    const isShared = ["COMMON_VIEW_READY", "AGREEMENT_PENDING", "COMPLETED"].includes(room.state);
    return {
      room: {
        id: room.roomId,
        code: room.code,
        state: room.state,
        goal: "让我被准确理解",
      },
      me: { id: "mock-participant", role: room.role, display_name: "我" },
      privateDraft: null,
      ownPerspective: null,
      approvedPerspectives: isShared
        ? [
            { role: "A", fact: "计划改变后，我在第二天收到消息。", meaning: "我感到失落和焦虑。", impact: "我需要及时的信息和确定感。", request: "变化当天，是否愿意先告诉我仍有不确定？" },
            { role: "B", fact: "我在确认变化后发送了消息。", meaning: "我感到紧张和为难。", impact: "我需要核实信息的空间，也需要被信任。", request: "信息未确认时，是否愿意允许我标注为待定？" },
          ]
        : [],
      sharedView: isShared
        ? {
            common_ground: "双方都希望减少误解。",
            disagreement: "对于何时告知变化，双方期待不同。",
            core_question: "怎样既能提前同步不确定性，也保留确认情况的空间？",
          }
        : null,
      agreement: isShared ? agreement : null,
    };
  }

  function accept(role: RoomSession["role"]) {
    if (!agreement) throw new Error("还没有可以确认的约定。");
    agreement = {
      ...agreement,
      accepted_a: role === "A" ? true : agreement.accepted_a,
      accepted_b: role === "B" ? true : agreement.accepted_b,
    };
    const activated = agreement.accepted_a && agreement.accepted_b;
    if (activated) {
      room = { ...room, state: "COMPLETED" };
      agreement = { ...agreement, activated_at: new Date().toISOString() };
    }
    return { state: room.state, activated };
  }

  function call<T>(name: string, args: RpcArgs): T {
    if (name === "create_room") {
      room = { ...defaultRoom };
      agreement = null;
      return room as T;
    }
    if (name === "set_room_goal") {
      room = { ...room, state: "A_DRAFTING" };
      return { state: room.state } as T;
    }
    if (name === "save_private_draft") {
      room = { ...room, state: room.role === "A" ? "A_REVIEWING" : "B_REVIEWING" };
      return { state: room.state } as T;
    }
    if (name === "approve_perspective") {
      room = { ...room, state: room.role === "A" ? "WAITING_FOR_B" : "COMMON_VIEW_READY" };
      return { state: room.state, version: 1 } as T;
    }
    if (name === "join_room") {
      room = { ...room, code: String(args.p_code), role: "B", state: "B_DRAFTING" };
      agreement = null;
      return room as T;
    }
    if (name === "propose_agreement") {
      room = { ...room, state: "AGREEMENT_PENDING" };
      agreement = {
        id: "22222222-2222-4222-8222-222222222222",
        proposal: String(args.p_proposal),
        review_at: String(args.p_review_at),
        accepted_a: false,
        accepted_b: false,
        activated_at: null,
        created_at: new Date().toISOString(),
      };
      return { state: room.state } as T;
    }
    if (name === "accept_agreement") return accept(room.role) as T;
    if (name === "get_room_snapshot") return snapshot() as T;
    throw new Error(`Mock RPC 尚未实现：${name}`);
  }

  function simulatePartnerAcceptance() {
    return accept(room.role === "A" ? "B" : "A");
  }

  return { call, simulatePartnerAcceptance, snapshot };
}
