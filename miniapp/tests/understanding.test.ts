import { describe, expect, it } from "vitest";
import {
  isSharedUnderstanding,
  parseUnderstandingConfirmation,
  parseUnderstandingStatus,
  sharedUnderstandingDisplay,
  shouldShowRoomReminder,
  sourceLabel,
  type SharedUnderstanding,
} from "../src/domain/understanding";

const payload = {
  schemaVersion: 1 as const,
  commonGround: [{ text: "双方都希望更可预期", sources: ["A.need", "B.need"] as const }],
  differences: [{
    topic: "何时告知",
    sideA: "可能变化时",
    sideB: "确认变化后",
    sources: ["A.request", "B.request"] as const,
  }],
  unverifiedFacts: [],
  boundaries: [],
  candidateUnderstanding: {
    text: "双方对通知时点的期待不同",
    sources: ["A.request", "B.request"] as const,
  },
  coreQuestion: {
    text: "怎样定义足够早",
    sources: ["A.request", "B.request"] as const,
  },
};

describe("shared understanding", () => {
  it("parses a reviewed result without model-private safety fields", () => {
    expect(isSharedUnderstanding(payload)).toBe(true);
    const status = parseUnderstandingStatus({
      phase: "UNDERSTANDING_CONFIRMING",
      status: "SUCCEEDED",
      progress: { A: "CONFIRMED", B: "CONFIRMED" },
      result: {
        id: "result-id",
        version: 1,
        contentHash: "a".repeat(64),
        payload,
        publishedAt: "2026-08-10T00:00:00Z",
      },
      ownDecision: null,
      accurateCount: 0,
      errorCode: null,
    });
    expect(status.result?.payload.differences[0].sideB).toBe("确认变化后");
    expect("safetyDisposition" in status.result!.payload).toBe(false);
  });

  it("collapses repeated cards for display without changing the reviewed payload", () => {
    const repeated = {
      ...payload,
      differences: [payload.differences[0], { ...payload.differences[0] }, { ...payload.differences[0] }],
      commonGround: [payload.commonGround[0], { ...payload.commonGround[0] }],
    };
    const display = sharedUnderstandingDisplay(repeated as unknown as SharedUnderstanding);
    if (display.schemaVersion !== 1) throw new Error("expected historical v1 result");
    expect(display.differences).toHaveLength(1);
    expect(display.commonGround).toHaveLength(1);
    expect(repeated.differences).toHaveLength(3);
    expect(repeated.commonGround).toHaveLength(2);
  });

  it("accepts the reciprocal-understanding result while keeping v1 history readable", () => {
    const mutual: SharedUnderstanding = {
      schemaVersion: 2 as const,
      mutualUnderstanding: [{
        listenerRole: "A" as const,
        speakerRole: "B" as const,
        text: "发起者听懂受邀者担心反复更正会带来消耗",
        sources: ["DIALOGUE.RESPONSE.B.4", "DIALOGUE.REFLECTION.A.5", "DIALOGUE.REFLECTION_CONFIRMATION.B.6"],
      }, {
        listenerRole: "B" as const,
        speakerRole: "A" as const,
        text: "受邀者听懂发起者面对未知等待会不安",
        sources: ["DIALOGUE.RESPONSE.A.1", "DIALOGUE.REFLECTION.B.2", "DIALOGUE.REFLECTION_CONFIRMATION.A.3"],
      }],
      newUnderstanding: {
        text: "双方确认争议不是要不要告知，而是如何兼顾及时与准确",
        sources: ["DIALOGUE.RESPONSE.A.1", "DIALOGUE.RESPONSE.B.4"],
      },
      differences: payload.differences.map((item) => ({ ...item, sources: [...item.sources] })),
      unverifiedFacts: [],
      boundaries: [],
      nextQuestion: {
        text: "信息未确定时，先告知到什么程度？",
        sources: ["DIALOGUE.RESPONSE.A.1", "DIALOGUE.RESPONSE.B.4"],
      },
    };
    expect(isSharedUnderstanding(mutual)).toBe(true);
    const display = sharedUnderstandingDisplay(mutual);
    if (display.schemaVersion !== 2) throw new Error("expected reciprocal v2 result");
    expect(display.mutualUnderstanding).toHaveLength(2);
    expect(isSharedUnderstanding(payload)).toBe(true);
  });

  it("rejects a malformed public result", () => {
    expect(() => parseUnderstandingStatus({
      phase: "UNDERSTANDING_CONFIRMING",
      status: "SUCCEEDED",
      progress: {},
      result: { id: "result-id", version: 1, contentHash: "bad", payload: {}, publishedAt: "now" },
      ownDecision: null,
      accurateCount: 0,
      errorCode: null,
    })).toThrow("无效共同理解");
  });

  it("rejects an unknown room phase instead of inventing client state", () => {
    expect(() => parseUnderstandingStatus({
      phase: "MADE_UP_PHASE",
      status: "WAITING",
      progress: {},
      result: null,
      ownDecision: null,
      accurateCount: 0,
      errorCode: null,
    })).toThrow("无效共同理解状态");
  });

  it("turns stable evidence paths into human labels", () => {
    expect(sourceLabel("A.observation")).toBe("发起者 · 观察");
    expect(sourceLabel("B.selfProtectiveAction")).toBe("受邀者 · 自我保护行动");
    expect(sourceLabel("DIALOGUE.RESPONSE.B.7")).toBe("第 7 条 · 受邀者回应");
    expect(isSharedUnderstanding({
      ...payload,
      candidateUnderstanding: {
        text: "双方在沟通中确认了新的理解",
        sources: ["DIALOGUE.RESPONSE.A.6", "DIALOGUE.RESPONSE.B.7"],
      },
    })).toBe(true);
  });

  it("rejects confirmation responses whose count and phase disagree", () => {
    expect(parseUnderstandingConfirmation({
      decision: "ACCURATE", accurateCount: 2, bothConfirmed: true, phase: "ACTION_GENERATING",
    }).phase).toBe("ACTION_GENERATING");
    expect(() => parseUnderstandingConfirmation({
      decision: "ACCURATE", accurateCount: 1, bothConfirmed: true, phase: "ACTION_GENERATING",
    })).toThrow("无效确认状态");
  });

  it("offers the room link only while this person waits for the other confirmation", () => {
    expect(shouldShowRoomReminder("ACCURATE", 1)).toBe(true);
    expect(shouldShowRoomReminder(null, 0)).toBe(false);
    expect(shouldShowRoomReminder("INACCURATE", 0)).toBe(false);
    expect(shouldShowRoomReminder("ACCURATE", 2)).toBe(false);
  });
});
