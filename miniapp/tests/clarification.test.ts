import { describe, expect, it } from "vitest";
import {
  clarificationConversationMessages,
  composeClarificationSource,
  expressionCandidateClarificationQuestion,
  isRepeatedDiscoveryQuestion,
  nextClarificationQuestion,
  nextMissingFieldQuestion,
  optionalClarificationQuestion,
  parseClarificationSource,
  parseDiscoveryUnderstandingState,
  sanitizeClarificationTurns,
  shouldPreserveDraftOnAiExit,
} from "../src/domain/clarification";

describe("private AI clarification", () => {
  it("asks one unanswered question at a time beyond the old three-turn cutoff", () => {
    const uncertainties = ["当时具体说了什么？", "你最在意的是什么？"];
    const turns = [{ question: uncertainties[0], answer: "他说那位女生很好看。" }];
    expect(nextClarificationQuestion(uncertainties, turns)).toBe(uncertainties[1]);
    expect(nextClarificationQuestion(["还要补充吗？"], [
      ...turns,
      { question: uncertainties[1], answer: "我在意被尊重。" },
      { question: "你希望怎样？", answer: "希望他降低音量。" },
    ])).toBe("还要补充吗？");
  });

  it("offers each open-ended continuation once without using a turn cutoff", () => {
    const first = optionalClarificationQuestion([]);
    expect(first).toContain("具体细节");
    const second = optionalClarificationQuestion([{ question: first, answer: "补充一" }]);
    expect(second).toContain("不像你真正想说的话");
    const third = optionalClarificationQuestion([
      { question: first, answer: "补充一" },
      { question: second, answer: "补充二" },
    ]);
    expect(third).toContain("最希望对方理解");
    expect(optionalClarificationQuestion([
      { question: first, answer: "补充一" },
      { question: second, answer: "补充二" },
      { question: third, answer: "补充三" },
    ])).toBe("");
  });

  it("never skips the private chat for an initial candidate with no model question", () => {
    expect(expressionCandidateClarificationQuestion([], [])).toContain("具体细节");
    expect(expressionCandidateClarificationQuestion([], [
      { question: "发生了什么？", answer: "我们在视频通话。" },
    ])).toBe("");
  });

  it("targets an unfilled required card field instead of asking a generic question", () => {
    const fields = [
      { key: "observation", label: "观察", prompt: "发生了什么？" },
      { key: "feeling", label: "感受", prompt: "你有什么感受？" },
      { key: "reason", label: "原因", prompt: "为什么？", optional: true },
    ];
    const expression = { fields: { observation: "昨晚没有收到回复", feeling: "", reason: "" } };
    const question = nextMissingFieldQuestion(expression, fields, []);
    expect(question).toBe("表达卡的「感受」还没有补全。你有什么感受？");
    expect(nextMissingFieldQuestion(expression, fields, [
      { question, answer: "我感到失望。" },
    ])).toBe("");
  });

  it("builds a continuous private chat and shows thinking in place", () => {
    const turns = [{ question: "当时具体说了什么？", answer: "他说另一个女生很好看。" }];
    expect(clarificationConversationMessages(turns, "你最在意什么？", false)).toEqual([
      { role: "assistant", kind: "message", content: "当时具体说了什么？" },
      { role: "user", kind: "message", content: "他说另一个女生很好看。" },
      { role: "assistant", kind: "message", content: "你最在意什么？" },
    ]);
    const thinkingMessages = clarificationConversationMessages(turns, "不会提前显示的下一问", true);
    expect(thinkingMessages).toHaveLength(3);
    expect(thinkingMessages[thinkingMessages.length - 1]).toEqual({
      role: "assistant",
      kind: "typing",
      content: "",
    });
  });

  it("round-trips private answers without changing the visible original text", () => {
    const original = "男朋友大声说另一个女生很好看，我很难过。";
    const turns = [{ question: "当时还有谁在场？", answer: "只有我们两个人。" }];
    const composed = composeClarificationSource(original, turns);
    expect(composed).toContain("privateClarifications");
    expect(parseClarificationSource(composed)).toEqual({ sourceText: original, turns });
  });

  it("drops malformed or empty cached turns", () => {
    expect(sanitizeClarificationTurns([
      { question: "  发生在什么时候？ ", answer: " 昨晚 " },
      { question: "没有回答", answer: "" },
      null,
    ])).toEqual([{ question: "发生在什么时候？", answer: "昨晚" }]);
  });

  it("keeps every valid cached turn instead of truncating by conversation count", () => {
    const turns = Array.from({ length: 12 }, (_, index) => ({
      question: `问题 ${index + 1}`,
      answer: `回答 ${index + 1}`,
    }));
    expect(sanitizeClarificationTurns(turns)).toEqual(turns);
  });

  it("normalizes punctuation and spacing before comparing discovery questions", () => {
    const turns = [{ question: "你希望他具体怎么提醒你？", answer: "睡前提醒我一次。" }];
    expect(isRepeatedDiscoveryQuestion(" 你希望他具体怎么提醒你  ", turns)).toBe(true);
    expect(isRepeatedDiscoveryQuestion("你希望他怎样表达关心？", turns)).toBe(false);
  });

  it("accepts only a complete and internally consistent discovery state", () => {
    const state = {
      coverage: {
        event: { status: "ENOUGH", evidence: ["昨晚发生争执"], missingInfo: "" },
        impact: { status: "MISSING", evidence: [], missingInfo: "缺少具体影响" },
        intention: { status: "MISSING", evidence: [], missingInfo: "缺少沟通意图" },
      },
      latestAnswerUpdate: { absorbed: true, updatedDimensions: ["event"] },
      nextQuestion: {
        focusDimension: "impact",
        text: "这件事对你有什么影响？",
        purpose: "补充具体影响",
      },
    };
    expect(parseDiscoveryUnderstandingState(state)).toEqual(state);
    expect(parseDiscoveryUnderstandingState({
      ...state,
      coverage: {
        ...state.coverage,
        impact: { status: "ENOUGH", evidence: [], missingInfo: "" },
      },
    })).toBeNull();
  });

  it("preserves a prior draft when a follow-up job is canceled or fails", () => {
    expect(shouldPreserveDraftOnAiExit({ observation: "" }, [])).toBe(false);
    expect(shouldPreserveDraftOnAiExit({ observation: "旧草稿" }, [])).toBe(true);
    expect(shouldPreserveDraftOnAiExit({ observation: "" }, [
      { question: "当时发生了什么？", answer: "是在吃饭时发生的。" },
    ])).toBe(true);
  });

  it("refuses to silently truncate an overlong private context", () => {
    expect(() => composeClarificationSource("a".repeat(11990), [
      { question: "还发生了什么？", answer: "补充" },
    ])).toThrow("超过 12000 字");
  });

  it("never exposes a malformed private context as visible original text", () => {
    const parsed = parseClarificationSource(
      "原话\n\n<<<SHUOKAI_PRIVATE_CLARIFICATION_V1>>>\nnot-json",
    );
    expect(parsed).toEqual({ sourceText: "原话", turns: [] });
  });
});
