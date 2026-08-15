import { describe, expect, it } from "vitest";
import {
  canSummarizeMutualUnderstanding,
  dialogueActionCopy,
  dialogueMutualProgress,
  dialogueTurnText,
  parseDialogueState,
} from "../src/domain/dialogue";

const state = {
  phase: "DIALOGUE",
  revision: 4,
  round: 2,
  step: "AWAITING_REFLECTION",
  ownRole: "B",
  activeRole: "B",
  canAct: true,
  focusTurnId: "11111111-1111-4111-8111-111111111111",
  turns: [{
    id: "11111111-1111-4111-8111-111111111111",
    sequence: 1,
    round: 1,
    kind: "OPENING",
    authorRole: "A",
    replyToTurnId: null,
    payload: { card: { mode: "NVC", observation: "对方打断了我", need: "被听见" } },
    createdAt: "2026-08-14T00:00:00Z",
  }],
};

describe("guided dialogue", () => {
  it("parses a bounded timeline and tells the active listener to reflect first", () => {
    const parsed = parseDialogueState(state);
    expect(dialogueActionCopy(parsed)).toContain("听懂");
    expect(dialogueTurnText(parsed.turns[0])).toBe("对方打断了我\n被听见");
  });

  it("rejects malformed timeline events at the client boundary", () => {
    expect(() => parseDialogueState({ ...state, turns: [{ payload: "private" }] })).toThrow("无效内容");
  });

  it("only allows a summary after both listeners are confirmed and respond", () => {
    const turns = [
      ...state.turns,
      { id: "b-reflects-a", sequence: 2, round: 1, kind: "REFLECTION", authorRole: "B", replyToTurnId: state.turns[0].id, payload: { text: "我听见你想被听见。" }, createdAt: "2026-08-14T00:01:00Z" },
      { id: "a-confirms-b", sequence: 3, round: 1, kind: "REFLECTION_CONFIRMATION", authorRole: "A", replyToTurnId: "b-reflects-a", payload: { decision: "ACCURATE", feedback: "" }, createdAt: "2026-08-14T00:02:00Z" },
      { id: "b-responds", sequence: 4, round: 1, kind: "RESPONSE", authorRole: "B", replyToTurnId: "a-confirms-b", payload: { text: "我会先听完。" }, createdAt: "2026-08-14T00:03:00Z" },
      { id: "b-opening", sequence: 5, round: 1, kind: "OPENING", authorRole: "B", replyToTurnId: null, payload: { card: { mode: "NVC", need: "喘息空间" } }, createdAt: "2026-08-14T00:04:00Z" },
      { id: "a-reflects-b", sequence: 6, round: 1, kind: "REFLECTION", authorRole: "A", replyToTurnId: "b-opening", payload: { text: "我听见你需要喘息空间。" }, createdAt: "2026-08-14T00:05:00Z" },
      { id: "b-confirms-a", sequence: 7, round: 1, kind: "REFLECTION_CONFIRMATION", authorRole: "B", replyToTurnId: "a-reflects-b", payload: { decision: "ACCURATE", feedback: "" }, createdAt: "2026-08-14T00:06:00Z" },
    ];
    const awaitingFinalResponse = parseDialogueState({ ...state, turns });
    expect(dialogueMutualProgress(awaitingFinalResponse)).toEqual([
      { listenerRole: "A", heardOther: true, responded: false },
      { listenerRole: "B", heardOther: true, responded: true },
    ]);
    expect(canSummarizeMutualUnderstanding(awaitingFinalResponse)).toBe(false);

    const complete = parseDialogueState({
      ...state,
      turns: [...turns, { id: "a-responds", sequence: 8, round: 1, kind: "RESPONSE", authorRole: "A", replyToTurnId: "b-confirms-a", payload: { text: "我愿意一次只谈十分钟。" }, createdAt: "2026-08-14T00:07:00Z" }],
    });
    expect(canSummarizeMutualUnderstanding(complete)).toBe(true);
  });
});
