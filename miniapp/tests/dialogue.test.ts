import { describe, expect, it } from "vitest";
import { dialogueActionCopy, dialogueTurnText, parseDialogueState } from "../src/domain/dialogue";

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
});
