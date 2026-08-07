import { describe, expect, it } from "vitest";
import {
  canNavigateBack,
  canTransition,
  previousStage,
  stageForRoom,
} from "../src/domain/room-state";

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

  it("only allows local back navigation before a server transition", () => {
    expect(canNavigateBack("CLARIFY")).toBe(true);
    expect(canNavigateBack("RECORD")).toBe(false);
    expect(canNavigateBack("REVIEW")).toBe(false);
  });

  it("routes each participant from the authoritative room state", () => {
    expect(stageForRoom("A", "WAITING_FOR_B")).toBe("INVITE");
    expect(stageForRoom("B", "B_DRAFTING")).toBe("RECORD");
    expect(stageForRoom("B", "COMMON_VIEW_READY")).toBe("COMMON");
    expect(stageForRoom("A", "AGREEMENT_PENDING")).toBe("AGREEMENT");
    expect(stageForRoom("B", "COMPLETED")).toBe("COMPLETE");
  });
});
