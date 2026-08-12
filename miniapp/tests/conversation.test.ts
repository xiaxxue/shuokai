import { describe, expect, it } from "vitest";
import {
  appendConversationTurn,
  composeConversationSource,
  conversationReplyFromCandidate,
  conversationSourceStage,
  conversationTranscript,
  createPrivateConversation,
  parseConversationSource,
  sanitizeConversationTurns,
} from "../src/domain/conversation";
import { createEditableExpression } from "../src/domain/expression";

describe("private guided conversation", () => {
  it("opens without guessing how the user feels", () => {
    expect(createPrivateConversation()).toEqual([{
      id: "private-turn-1",
      role: "AI",
      kind: "OPENING",
      text: "这次想聊什么？",
    }]);
  });

  it("keeps user turns readable while preserving AI-question context privately", () => {
    let turns = createPrivateConversation();
    turns = appendConversationTurn(turns, {
      role: "USER",
      kind: "USER_INPUT",
      text: "计划变了，但一直没人告诉我。",
    });
    turns = appendConversationTurn(turns, {
      role: "AI",
      kind: "QUESTION",
      text: "你希望对方下次怎么告诉你？",
    });
    turns = appendConversationTurn(turns, {
      role: "USER",
      kind: "USER_INPUT",
      text: "哪怕先说还没确定也可以。",
    });

    expect(conversationTranscript(turns)).toBe(
      "计划变了，但一直没人告诉我。\n\n哪怕先说还没确定也可以。",
    );
    expect(parseConversationSource(composeConversationSource(turns))).toEqual(turns.map((turn) => ({
      ...turn,
      ...(turn.kind === "QUESTION" ? {
        supportingText: "为了不替你补全没有说过的部分，我只确认这一件事。",
      } : {}),
    })));
    expect(conversationSourceStage(composeConversationSource(turns))).toBe("CONVERSATION");
    expect(conversationSourceStage(composeConversationSource(turns, "FINAL"))).toBe("FINAL");
  });

  it("turns one model uncertainty into one skippable question", () => {
    const expression = createEditableExpression("NVC");
    expression.uncertainties = ["当时具体约定了什么？", "还有谁在场？"];
    expect(conversationReplyFromCandidate(expression)).toMatchObject({
      kind: "QUESTION",
      text: "当时具体约定了什么？",
      supportingText: expect.stringContaining("只确认这一件事"),
    });
  });

  it("stays quiet when the model has no useful question", () => {
    expect(conversationReplyFromCandidate(createEditableExpression("NVC"))).toEqual({
      kind: "ACKNOWLEDGEMENT",
      text: "这一段我先记下了。",
      supportingText: "你可以接着讲；等你觉得差不多了，再由你决定是否整理。",
    });
  });

  it("does not repeat a question that was already asked", () => {
    const expression = createEditableExpression("NVC");
    expression.uncertainties = ["当时具体约定了什么？"];
    expect(conversationReplyFromCandidate(expression, ["当时具体约定了什么？"]).kind)
      .toBe("ACKNOWLEDGEMENT");
  });

  it("drops malformed cached turns and never restores untrusted roles", () => {
    expect(sanitizeConversationTurns([
      { role: "SYSTEM", kind: "QUESTION", text: "不可信" },
      { role: "USER", kind: "USER_INPUT", text: "  保留我说的  " },
    ])).toEqual([
      ...createPrivateConversation(),
      { id: "private-turn-2", role: "USER", kind: "USER_INPUT", text: "保留我说的" },
    ]);
  });

  it("refuses to silently truncate an overlong private conversation", () => {
    let turns = createPrivateConversation();
    for (let index = 0; index < 11; index += 1) {
      turns = appendConversationTurn(turns, {
        role: "USER",
        kind: "USER_INPUT",
        text: "话".repeat(1200),
      });
    }
    expect(() => composeConversationSource(turns)).toThrow("接近 12000 字");
  });

  it("refuses to silently truncate one long typed or transcribed turn", () => {
    expect(() => appendConversationTurn(createPrivateConversation(), {
      role: "USER",
      kind: "USER_INPUT",
      text: "原话".repeat(601),
    })).toThrow("原文不会被截断");
  });
});
