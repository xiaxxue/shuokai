import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendConversationTurn } from "../src/domain/conversation";
import { createEditableExpression } from "../src/domain/expression";
import type { RoomSession } from "../src/domain/types";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  save: vi.fn(),
  setGoal: vi.fn(),
  pause: vi.fn(),
}));

vi.mock("../src/services/api", () => ({
  requestExpressionOrganization: mocks.request,
  roomApi: {
    saveExpressionWorkspace: mocks.save,
    setGoal: mocks.setGoal,
    pause: mocks.pause,
  },
}));

import { usePrivateConversation } from "../src/composables/use-private-conversation";

function useTestController(initialState: RoomSession["state"] = "A_DRAFTING") {
  const room = ref<RoomSession | null>({
    roomId: "11111111-1111-4111-8111-111111111111",
    code: "SAY2026",
    role: "A",
    state: initialState,
    workflowVersion: 2,
    phaseV2: initialState === "GOAL_SETTING" ? "SETUP" : "PRIVATE_EXPRESSION",
  });
  const stage = ref("CONVERSATION" as const);
  const busy = ref(false);
  const workspaceRevision = ref(0);
  const aiJobId = ref("");
  const aiJobPurpose = ref<"CONVERSATION" | "FINAL">("FINAL");
  const pollExpressionJob = vi.fn(async () => {});
  const setNotice = vi.fn();
  const controller = usePrivateConversation({
    room,
    stage,
    busy,
    recording: ref(false),
    transcript: ref(""),
    selectedMode: ref("NVC"),
    editableExpression: ref(createEditableExpression("NVC")),
    workspaceRevision,
    aiJobId,
    aiJobPurpose,
    clarificationSkipped: ref(false),
    draftSaveState: ref("empty"),
    contentScrollTop: ref(0),
    updateRoom: (next) => { room.value = next; },
    setNotice,
    clearNotice: vi.fn(),
    formatError: (error, fallback) => error instanceof Error ? error.message : fallback,
    confirmPause: async () => false,
    pollExpressionJob,
    stopExpressionJobPolling: vi.fn(),
  });
  return { controller, room, stage, busy, workspaceRevision, aiJobId, aiJobPurpose, pollExpressionJob, setNotice };
}

describe("private conversation orchestration", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("moves a new room into private expression and requests a contextual AI reply", async () => {
    mocks.setGoal.mockResolvedValueOnce({ state: "A_DRAFTING" });
    mocks.request.mockResolvedValueOnce({ revision: 1, jobId: "22222222-2222-4222-8222-222222222222" });
    const context = useTestController("GOAL_SETTING");
    context.controller.composer.value = "计划变了，但一直没人告诉我。";

    await context.controller.send();

    expect(mocks.setGoal).toHaveBeenCalledWith(context.room.value?.roomId, "先把这次想聊的事情说清楚");
    expect(mocks.request).toHaveBeenCalledWith(
      context.room.value?.roomId,
      0,
      expect.stringContaining('"stage":"CONVERSATION"'),
      "NVC",
      expect.any(Object),
    );
    expect(context.aiJobPurpose.value).toBe("CONVERSATION");
    expect(context.busy.value).toBe(true);
    expect(context.pollExpressionJob).toHaveBeenCalledWith(context.aiJobId.value);
  });

  it("keeps listening mode private without invoking AI", async () => {
    mocks.save.mockResolvedValueOnce({ revision: 1 });
    const context = useTestController();
    context.controller.toggleGuidance();

    await context.controller.submitText("我想先把后面的事情讲完。");

    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledWith(
      context.room.value?.roomId,
      0,
      expect.stringContaining('"stage":"CONVERSATION"'),
      "NVC",
      expect.any(Object),
    );
    expect(context.busy.value).toBe(false);
    expect(context.setNotice).toHaveBeenCalledWith("success", expect.stringContaining("保持安静"));
  });

  it("records final intent separately before showing a candidate", async () => {
    mocks.request.mockResolvedValueOnce({ revision: 3, jobId: "33333333-3333-4333-8333-333333333333" });
    const context = useTestController();
    context.controller.turns.value = appendConversationTurn(context.controller.turns.value, {
      role: "USER",
      kind: "USER_INPUT",
      text: "我希望计划变化时能提前告诉我。",
    });

    await context.controller.finish();

    expect(mocks.request).toHaveBeenCalledWith(
      context.room.value?.roomId,
      0,
      expect.stringContaining('"stage":"FINAL"'),
      "NVC",
      expect.any(Object),
    );
    expect(context.stage.value).toBe("AI_PENDING");
    expect(context.aiJobPurpose.value).toBe("FINAL");
  });
});
