import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientStage } from "../src/domain/room-state";
import type { RoomSession } from "../src/domain/types";

const mocks = vi.hoisted(() => ({
  clarify: vi.fn(),
}));

vi.mock("../src/services/api", () => ({
  requestExpressionClarification: mocks.clarify,
}));

import { useExpressionDiscovery } from "../src/composables/use-expression-discovery";

function discoveryResponse(question: string, ready = false, absorbed = false) {
  return {
    question,
    ready,
    understanding: {
      coverage: {
        event: { status: "ENOUGH" as const, evidence: ["男朋友不想提醒我睡觉"], missingInfo: "" },
        impact: ready
          ? { status: "ENOUGH" as const, evidence: ["觉得很烦"], missingInfo: "" }
          : { status: "MISSING" as const, evidence: [], missingInfo: "缺少具体影响" },
        intention: ready
          ? { status: "ENOUGH" as const, evidence: ["希望他知道"], missingInfo: "" }
          : { status: "MISSING" as const, evidence: [], missingInfo: "缺少沟通意图" },
      },
      latestAnswerUpdate: {
        absorbed,
        updatedDimensions: absorbed ? ["intention" as const] : [],
      },
      nextQuestion: ready
        ? { focusDimension: "none" as const, text: "", purpose: "" }
        : { focusDimension: "impact" as const, text: question, purpose: "补充具体影响" },
    },
    safetyDisposition: "ALLOW" as const,
    safetyMessage: "",
  };
}

function useTestFlow() {
  const room = ref<RoomSession | null>({
    roomId: "11111111-1111-4111-8111-111111111111",
    code: "SAY2026",
    role: "A",
    state: "WAITING_FOR_B",
    workflowVersion: 2,
    phaseV2: "PRIVATE_EXPRESSION",
  });
  const stage = ref<ClientStage>("RECORD");
  const busy = ref(false);
  const transcript = ref("男朋友不想提醒我睡觉，并且觉得很烦");
  const selectedMode = ref<"NVC" | "FACT_DISPUTE" | "BOUNDARY" | "PAUSE" | null>(null);
  const turns = ref<{ question: string; answer: string }[]>([]);
  const answer = ref("");
  const setNotice = vi.fn();
  const clearNotice = vi.fn();
  const flow = useExpressionDiscovery({
    room,
    stage,
    busy,
    recording: ref(false),
    transcript,
    selectedMode,
    turns,
    answer,
    setNotice,
    clearNotice,
    formatError: (error, fallback) => error instanceof Error ? error.message : fallback,
  });
  return { flow, stage, busy, transcript, selectedMode, turns, answer, setNotice };
}

describe("expression discovery orchestration", () => {
  beforeEach(() => {
    mocks.clarify.mockReset();
  });

  it("starts with the user's story and waits for AI before enabling route selection", async () => {
    mocks.clarify.mockResolvedValueOnce(
      discoveryResponse("当他拒绝提醒时，你最希望他理解什么？"),
    );
    const state = useTestFlow();

    await state.flow.send();

    expect(mocks.clarify).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      state.transcript.value,
      [],
    );
    expect(state.flow.started.value).toBe(true);
    expect(state.flow.question.value).toContain("最希望他理解");
    expect(state.flow.understanding.value?.nextQuestion.purpose).toBe("补充具体影响");
    expect(state.stage.value).toBe("RECORD");
    expect(state.busy.value).toBe(false);
  });

  it("appends each answer before asking the next question", async () => {
    mocks.clarify
      .mockResolvedValueOnce(discoveryResponse("当他拒绝提醒时，你最希望他理解什么？"))
      .mockResolvedValueOnce(discoveryResponse("", true, true));
    const state = useTestFlow();
    await state.flow.send();
    state.answer.value = "我希望他知道，这会让我觉得被关心。";

    await state.flow.send();

    expect(mocks.clarify).toHaveBeenLastCalledWith(
      "11111111-1111-4111-8111-111111111111",
      state.transcript.value,
      [{
        question: "当他拒绝提醒时，你最希望他理解什么？",
        answer: "我希望他知道，这会让我觉得被关心。",
      }],
    );
    expect(state.turns.value).toHaveLength(1);
    expect(state.answer.value).toBe("");
    expect(state.flow.ready.value).toBe(true);
  });

  it("continues schema-driven discovery beyond the former client and server cutoffs", async () => {
    mocks.clarify.mockResolvedValueOnce(discoveryResponse("还有哪一点会影响对方理解？", false, true));
    const state = useTestFlow();
    state.flow.started.value = true;
    state.flow.question.value = "这件事现在对你还有什么影响？";
    const existingTurns = Array.from({ length: 8 }, (_, index) => ({
      question: `之前的问题 ${index + 1}`,
      answer: `之前的回答 ${index + 1}`,
    }));
    state.turns.value = existingTurns;
    state.answer.value = "我还想补充这一点。";

    await state.flow.send();

    expect(mocks.clarify).toHaveBeenLastCalledWith(
      "11111111-1111-4111-8111-111111111111",
      state.transcript.value,
      [...existingTurns, {
        question: "这件事现在对你还有什么影响？",
        answer: "我还想补充这一点。",
      }],
    );
    expect(state.turns.value).toHaveLength(9);
  });

  it("allows an explicit skip without claiming incomplete context is ready", async () => {
    mocks.clarify.mockResolvedValueOnce(discoveryResponse("你希望这次沟通带来什么变化？"));
    const state = useTestFlow();

    state.flow.finish();
    expect(state.stage.value).toBe("RECORD");

    await state.flow.send();
    state.flow.finish();

    expect(state.selectedMode.value).toBeNull();
    expect(state.stage.value).toBe("MODE_SELECT");
    expect(state.setNotice).toHaveBeenLastCalledWith(
      "info",
      "你选择先停止追问。AI 会按目前提供的内容整理，之后仍可修改。 ",
    );
  });

  it("does not discard an unsent reply when route selection is requested", async () => {
    mocks.clarify.mockResolvedValueOnce(discoveryResponse("你最在意哪一部分？"));
    const state = useTestFlow();
    await state.flow.send();
    state.answer.value = "我还没把这句话发出去";

    state.flow.finish();

    expect(state.stage.value).toBe("RECORD");
    expect(state.setNotice).toHaveBeenLastCalledWith(
      "info",
      "这句话还没有发给 AI。请先发送，或清空后再选择表达路径。 ",
    );
  });

  it("does not enter route selection after a safety stop", async () => {
    mocks.clarify.mockResolvedValueOnce({
      ...discoveryResponse(""),
      safetyDisposition: "PAUSE",
      safetyMessage: "请先离开可能发生伤害的环境。",
      understanding: {
        ...discoveryResponse("").understanding,
        nextQuestion: { focusDimension: "none", text: "", purpose: "" },
      },
    });
    const state = useTestFlow();

    await state.flow.send();
    state.flow.finish();

    expect(state.stage.value).toBe("RECORD");
  });
});
