import { describe, expect, it } from "vitest";
import {
  parseAiConversationHistory,
  parseAiMemories,
  parseAiPrivateConversation,
} from "../src/domain/ai-memory";

const memoryId = "11111111-1111-4111-8111-111111111111";
const roomId = "22222222-2222-4222-8222-222222222222";

function understanding() {
  return {
    coverage: {
      event: { status: "ENOUGH", evidence: ["晚上约好沟通"], missingInfo: "" },
      impact: { status: "ENOUGH", evidence: ["我很失望"], missingInfo: "" },
      intention: { status: "ENOUGH", evidence: ["希望提前说明"], missingInfo: "" },
    },
    latestAnswerUpdate: { absorbed: true, updatedDimensions: ["intention"] },
    nextQuestion: { focusDimension: "none", text: "", purpose: "" },
  };
}

describe("AI private archive parsers", () => {
  it("accepts a bounded, room-scoped private conversation", () => {
    const parsed = parseAiPrivateConversation({
      revision: 3,
      sourceText: "我们昨晚没有按约沟通。",
      turns: [{ question: "你在意什么？", answer: "希望变化时提前说明。" }],
      question: "",
      ready: true,
      understanding: understanding(),
      safetyDisposition: "ALLOW",
      safetyMessage: "",
      summary: "用户希望计划变化时被提前告知。",
      updatedAt: "2026-08-15T12:00:00Z",
      memoryProposals: [{
        id: memoryId,
        kind: "PREFERENCE",
        content: "计划变化时，希望提前知道。",
        reason: "以后讨论计划变动时有用。",
        status: "PROPOSED",
      }],
    });

    expect(parsed.revision).toBe(3);
    expect(parsed.memoryProposals).toHaveLength(1);
  });

  it("rejects malformed understanding and impossible room phases", () => {
    expect(() => parseAiPrivateConversation({
      revision: 1, sourceText: "内容", turns: [], question: "", ready: true,
      understanding: { coverage: {} }, safetyDisposition: "ALLOW",
      safetyMessage: "", summary: "", updatedAt: "",
    })).toThrow("私人对话返回格式无效");

    expect(() => parseAiConversationHistory([{
      roomId, roomCode: "ROOM123", role: "A", state: "A_DRAFTING",
      workflowVersion: 2, phaseV2: "INTERNAL_ONLY", topic: "主题",
      summary: "摘要", ready: false, updatedAt: "2026-08-15T12:00:00Z",
    }])).toThrow("AI 对话历史返回格式无效");
  });

  it("keeps personal and explicitly consented relationship memories separate", () => {
    const parsed = parseAiMemories({
      personal: [{
        id: memoryId, kind: "NEED", content: "需要被提前告知。", reason: "",
        status: "CONFIRMED", roomId, roomCode: "ROOM123", topic: "计划变化",
      }],
      relationship: [{
        id: "33333333-3333-4333-8333-333333333333",
        kind: "NEW_UNDERSTANDING", content: "双方确认分歧在告知时机。",
        status: "ACTIVE", roomId, roomCode: "ROOM123", topic: "计划变化",
        sourceValid: true,
        myDecision: "REMEMBER", partnerDecision: "REMEMBER",
        updatedAt: "2026-08-15T12:00:00Z",
      }],
    });

    expect(parsed.personal[0].status).toBe("CONFIRMED");
    expect(parsed.relationship[0].kind).toBe("NEW_UNDERSTANDING");
  });
});
