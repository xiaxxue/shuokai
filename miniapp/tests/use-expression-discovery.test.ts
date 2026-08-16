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
      0,
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
      0,
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
      0,
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

  it("keeps an unsent reply when route selection is requested", async () => {
    mocks.clarify.mockResolvedValueOnce(discoveryResponse("你最在意哪一部分？"));
    const state = useTestFlow();
    await state.flow.send();
    state.answer.value = "我还没把这句话发出去";

    state.flow.finish();

    expect(state.stage.value).toBe("MODE_SELECT");
    expect(state.turns.value).toEqual([{
      question: "你最在意哪一部分？",
      answer: "我还没把这句话发出去",
    }]);
    expect(state.answer.value).toBe("");
    expect(state.setNotice).toHaveBeenLastCalledWith(
      "info",
      "已保留这句话。AI 会按现有内容整理，之后仍可修改。 ",
    );
  });

  it("keeps a failed reply editable and exposes both recovery paths", async () => {
    mocks.clarify
      .mockResolvedValueOnce(discoveryResponse("你最在意哪一部分？"))
      .mockRejectedValueOnce(new Error("AI 这次没有生成可用回复。请重新尝试，或按现有内容继续整理。"));
    const state = useTestFlow();
    await state.flow.send();
    state.answer.value = "这句话不能因为 AI 失败而丢失";

    await state.flow.send();

    expect(state.stage.value).toBe("RECORD");
    expect(state.answer.value).toBe("这句话不能因为 AI 失败而丢失");
    expect(state.turns.value).toEqual([]);
    expect(state.flow.saveState.value).toBe("local");
    expect(state.flow.failureMessage.value).toContain("按现有内容继续整理");
    expect(state.busy.value).toBe(false);
  });

  it("retries a failed reply without duplicating it", async () => {
    mocks.clarify
      .mockResolvedValueOnce(discoveryResponse("你最在意哪一部分？"))
      .mockRejectedValueOnce(new Error("暂时失败"))
      .mockResolvedValueOnce(discoveryResponse("接下来希望发生什么？", false, true));
    const state = useTestFlow();
    await state.flow.send();
    state.answer.value = "请保留并重试这一句";

    await state.flow.send();
    await state.flow.send();

    expect(state.turns.value).toEqual([{
      question: "你最在意哪一部分？",
      answer: "请保留并重试这一句",
    }]);
    expect(state.answer.value).toBe("");
    expect(state.flow.failureMessage.value).toBe("");
    expect(state.flow.saveState.value).toBe("saved");
  });

  it("continues after a failed reply and includes it in later organization", async () => {
    mocks.clarify
      .mockResolvedValueOnce(discoveryResponse("你最在意哪一部分？"))
      .mockRejectedValueOnce(new Error("暂时失败"));
    const state = useTestFlow();
    await state.flow.send();
    state.answer.value = "即使没有 AI 回复，也要带上这句话";
    await state.flow.send();

    state.flow.continueAfterFailure();

    expect(state.stage.value).toBe("MODE_SELECT");
    expect(state.turns.value).toEqual([{
      question: "你最在意哪一部分？",
      answer: "即使没有 AI 回复，也要带上这句话",
    }]);
    expect(state.answer.value).toBe("");
    expect(state.flow.failureMessage.value).toBe("");
    expect(state.setNotice).toHaveBeenLastCalledWith(
      "info",
      "已保留当前内容。现在选择表达路径，之后仍可修改。 ",
    );
  });

  it("can continue with the original story when the first AI reply fails", async () => {
    mocks.clarify.mockRejectedValueOnce(new Error("暂时失败"));
    const state = useTestFlow();

    await state.flow.send();
    state.flow.continueAfterFailure();

    expect(state.flow.started.value).toBe(false);
    expect(state.stage.value).toBe("MODE_SELECT");
    expect(state.transcript.value).toContain("男朋友不想提醒");
    expect(state.turns.value).toEqual([]);
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

  it("restores a durable room-scoped conversation with its optimistic revision", () => {
    const state = useTestFlow();
    const restored = state.flow.restore({
      revision: 4,
      sourceText: "上次已经讲到这里",
      turns: [{ question: "当时发生了什么？", answer: "我们约好晚上沟通。" }],
      question: "这件事对你造成了什么影响？",
      ready: false,
      understanding: discoveryResponse("这件事对你造成了什么影响？").understanding,
      safetyDisposition: "ALLOW",
      safetyMessage: "",
      summary: "用户正在说明一次未按约沟通的经历。",
      updatedAt: "2026-08-15T12:00:00Z",
      memoryProposals: [],
    });

    expect(restored).toBe(true);
    expect(state.transcript.value).toBe("上次已经讲到这里");
    expect(state.turns.value).toHaveLength(1);
    expect(state.flow.conversationRevision.value).toBe(4);
    expect(state.flow.restored.value).toBe(true);
    expect(state.flow.saveState.value).toBe("saved");
  });

  it("detaches an old unsent answer when a newer device has advanced the question", () => {
    const state = useTestFlow();
    state.flow.conversationRevision.value = 2;
    state.flow.question.value = "之前的问题";
    state.answer.value = "这是还没发送的旧问题答案";

    state.flow.restore({
      revision: 3,
      sourceText: "同一段沟通",
      turns: [{ question: "之前的问题", answer: "另一台设备已经回答" }],
      question: "新的问题",
      ready: false,
      understanding: discoveryResponse("新的问题").understanding,
      safetyDisposition: "ALLOW",
      safetyMessage: "",
      summary: "另一台设备继续了对话。",
      updatedAt: "2026-08-15T12:05:00Z",
      memoryProposals: [],
    });

    expect(state.answer.value).toBe("");
    expect(state.flow.question.value).toBe("新的问题");
    expect(state.flow.detachedDrafts.value).toEqual([{
      answer: "这是还没发送的旧问题答案",
      question: "之前的问题",
      revision: 2,
    }]);

    state.flow.reapplyDetachedDraft(0);
    expect(state.answer.value).toBe("这是还没发送的旧问题答案");
    expect(state.flow.detachedDrafts.value).toEqual([]);
    expect(state.flow.saveState.value).toBe("local");
  });

  it("marks typed but unsent content as local-only instead of synced", () => {
    const state = useTestFlow();
    state.flow.saveState.value = "saved";
    state.flow.markLocalDraft();
    expect(state.flow.saveState.value).toBe("local");
  });

  it("preserves two detached drafts and refuses to overwrite non-empty current input", () => {
    const state = useTestFlow();
    const conversation = (revision: number, question: string) => ({
      revision,
      sourceText: "同一段沟通",
      turns: [],
      question,
      ready: false,
      understanding: discoveryResponse(question).understanding,
      safetyDisposition: "ALLOW" as const,
      safetyMessage: "",
      summary: "跨设备继续中的对话。",
      updatedAt: "2026-08-15T12:05:00Z",
      memoryProposals: [],
    });
    state.flow.conversationRevision.value = 1;
    state.flow.question.value = "第一个旧问题";
    state.answer.value = "第一段未发送草稿";
    state.flow.restore(conversation(2, "第二个问题"));

    state.answer.value = "第二段未发送草稿";
    state.flow.restore(conversation(3, "最新问题"));

    expect(state.flow.detachedDrafts.value).toEqual([
      { answer: "第一段未发送草稿", question: "第一个旧问题", revision: 1 },
      { answer: "第二段未发送草稿", question: "第二个问题", revision: 2 },
    ]);
    state.answer.value = "我刚为最新问题输入的内容";
    state.flow.reapplyDetachedDraft(0);
    expect(state.answer.value).toBe("我刚为最新问题输入的内容");
    expect(state.flow.detachedDrafts.value).toHaveLength(2);
    expect(state.setNotice).toHaveBeenLastCalledWith(
      "info", "输入框里已有内容。请先发送或清空，再放回这段旧草稿。 ",
    );
    state.answer.value = "";
    state.flow.reapplyDetachedDraft(0);
    expect(state.answer.value).toBe("第一段未发送草稿");
    expect(state.flow.detachedDrafts.value).toEqual([
      { answer: "第二段未发送草稿", question: "第二个问题", revision: 2 },
    ]);
  });

  it("marks an unsent voice transcription as local-only", () => {
    const state = useTestFlow();
    state.flow.saveState.value = "saved";
    state.busy.value = true;
    state.flow.appendTranscription("answer", "语音补充的回答");
    expect(state.answer.value).toBe("语音补充的回答");
    expect(state.flow.saveState.value).toBe("local");
  });
});
