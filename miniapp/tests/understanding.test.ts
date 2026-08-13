import { describe, expect, it } from "vitest";
import {
  isSharedUnderstanding,
  parseUnderstandingConfirmation,
  parseUnderstandingStatus,
  sharedUnderstandingDisplay,
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
    expect(display.differences).toHaveLength(1);
    expect(display.commonGround).toHaveLength(1);
    expect(repeated.differences).toHaveLength(3);
    expect(repeated.commonGround).toHaveLength(2);
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
  });

  it("rejects confirmation responses whose count and phase disagree", () => {
    expect(parseUnderstandingConfirmation({
      decision: "ACCURATE", accurateCount: 2, bothConfirmed: true, phase: "ACTION_GENERATING",
    }).phase).toBe("ACTION_GENERATING");
    expect(() => parseUnderstandingConfirmation({
      decision: "ACCURATE", accurateCount: 1, bothConfirmed: true, phase: "ACTION_GENERATING",
    })).toThrow("无效确认状态");
  });
});
