import { describe, expect, it } from "vitest";
import { canTransition, previousStage } from "../src/domain/room-state";

describe("room state machine", () => {
  it("accepts only explicit server transitions", () => {
    expect(canTransition("GOAL_SETTING", "A_DRAFTING")).toBe(true);
    expect(canTransition("GOAL_SETTING", "COMPLETED")).toBe(false);
    expect(canTransition("COMPLETED", "GOAL_SETTING")).toBe(false);
  });

  it("does not navigate before the welcome screen", () => {
    expect(previousStage("WELCOME")).toBe("WELCOME");
    expect(previousStage("REVIEW")).toBe("CLARIFY");
  });
});
