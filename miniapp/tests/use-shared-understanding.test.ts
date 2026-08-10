import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomSession } from "../src/domain/types";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  status: vi.fn(),
}));

vi.mock("../src/services/api", () => ({
  requestSharedUnderstanding: mocks.request,
  roomApi: { understandingStatus: mocks.status },
  UnderstandingRequestError: class UnderstandingRequestError extends Error {
    constructor(message: string, readonly retryable: boolean) {
      super(message);
    }
  },
}));

import { useSharedUnderstanding } from "../src/composables/use-shared-understanding";

describe("shared understanding orchestration", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.status.mockReset();
  });

  it("preserves the authoritative action-generating phase when a result exists", async () => {
    const room = ref<RoomSession | null>({
      roomId: "11111111-1111-4111-8111-111111111111",
      code: "SAY2026",
      role: "A",
      state: "COMMON_VIEW_READY",
      workflowVersion: 2,
      phaseV2: "UNDERSTANDING_GENERATING",
    });
    const stage = ref("AI_PENDING" as const);
    mocks.request.mockResolvedValueOnce({ status: "SUCCEEDED" });
    mocks.status.mockResolvedValueOnce({
      phase: "ACTION_GENERATING",
      status: "SUCCEEDED",
      progress: { A: "CONFIRMED", B: "CONFIRMED" },
      result: {
        id: "result-id",
        version: 1,
        contentHash: "a".repeat(64),
        publishedAt: "2026-08-10T00:00:00Z",
        payload: {
          schemaVersion: 1,
          commonGround: [], differences: [], unverifiedFacts: [], boundaries: [],
          candidateUnderstanding: { text: "理解", sources: ["A.need", "B.need"] },
          coreQuestion: { text: "问题", sources: ["A.request", "B.request"] },
        },
      },
      ownDecision: "ACCURATE",
      accurateCount: 2,
      errorCode: null,
    });

    const flow = useSharedUnderstanding({
      room,
      stage,
      busy: ref(false),
      transcript: ref(""),
      selectedMode: ref(null),
      workspaceRevision: ref(0),
      updateRoom: (next) => { room.value = next; },
      setNotice: vi.fn(),
      clearNotice: vi.fn(),
      formatError: (error, fallback) => error instanceof Error ? error.message : fallback,
      confirmPause: async () => false,
    });

    await flow.ensure();

    expect(room.value?.phaseV2).toBe("ACTION_GENERATING");
    expect(stage.value).toBe("COMMON");
    expect(flow.retryAllowed.value).toBe(false);
  });

  it("does not offer a dead retry after a terminal review failure", async () => {
    const room = ref<RoomSession | null>({
      roomId: "11111111-1111-4111-8111-111111111111",
      code: "SAY2026",
      role: "B",
      state: "COMMON_VIEW_READY",
      workflowVersion: 2,
      phaseV2: "UNDERSTANDING_GENERATING",
    });
    const stage = ref("AI_PENDING" as const);
    mocks.request.mockResolvedValueOnce({ status: "FAILED_FINAL" });
    mocks.status.mockResolvedValueOnce({
      phase: "UNDERSTANDING_GENERATING",
      status: "FAILED_FINAL",
      progress: { A: "CONFIRMED", B: "CONFIRMED" },
      result: null,
      ownDecision: null,
      accurateCount: 0,
      errorCode: "UNDERSTANDING_REVIEW_FAILED",
    });

    const flow = useSharedUnderstanding({
      room,
      stage,
      busy: ref(false),
      transcript: ref(""),
      selectedMode: ref(null),
      workspaceRevision: ref(0),
      updateRoom: (next) => { room.value = next; },
      setNotice: vi.fn(),
      clearNotice: vi.fn(),
      formatError: (error, fallback) => error instanceof Error ? error.message : fallback,
      confirmPause: async () => false,
    });

    await flow.ensure();

    expect(flow.failure.value).toContain("未经审查的内容不会展示");
    expect(flow.retryAllowed.value).toBe(false);
  });
});
