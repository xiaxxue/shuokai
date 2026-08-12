import { describe, expect, it } from "vitest";
import {
  composeClarificationSource,
  nextClarificationQuestion,
  parseClarificationSource,
  sanitizeClarificationTurns,
} from "../src/domain/clarification";

describe("private AI clarification", () => {
  it("asks one unanswered question at a time and stops after three turns", () => {
    const uncertainties = ["当时具体说了什么？", "你最在意的是什么？"];
    const turns = [{ question: uncertainties[0], answer: "他说那位女生很好看。" }];
    expect(nextClarificationQuestion(uncertainties, turns)).toBe(uncertainties[1]);
    expect(nextClarificationQuestion(["还要补充吗？"], [
      ...turns,
      { question: uncertainties[1], answer: "我在意被尊重。" },
      { question: "你希望怎样？", answer: "希望他降低音量。" },
    ])).toBe("");
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
