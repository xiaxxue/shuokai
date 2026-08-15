import { describe, expect, it } from "vitest";
import {
  canNavigateBack,
  canTransition,
  previousStage,
  shouldLoadSnapshotAfterJoin,
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
    expect(previousStage("NVC_FEELING")).toBe("NVC_OBSERVATION");
    expect(previousStage("REVIEW")).toBe("NVC_REQUEST");
    expect(previousStage("MODE_SELECT")).toBe("RECORD");
    expect(previousStage("CLARIFICATION_CHAT")).toBe("MODE_SELECT");
    expect(previousStage("EXPRESSION_REVIEW")).toBe("MODE_SELECT");
    expect(previousStage("RELATIONSHIP_SETUP")).toBe("WELCOME");
  });

  it("only allows local back navigation before a server transition", () => {
    expect(canNavigateBack("NVC_OBSERVATION")).toBe(true);
    expect(canNavigateBack("NVC_REQUEST")).toBe(true);
    expect(canNavigateBack("RECORD")).toBe(false);
    expect(canNavigateBack("REVIEW")).toBe(true);
    expect(canNavigateBack("MODE_SELECT")).toBe(true);
    expect(canNavigateBack("CLARIFICATION_CHAT")).toBe(true);
    expect(canNavigateBack("EXPRESSION_REVIEW")).toBe(true);
    expect(canNavigateBack("RELATIONSHIP_CONFIRMATION")).toBe(true);
  });

  it("routes each participant from the authoritative room state", () => {
    expect(stageForRoom("A", "WAITING_FOR_B")).toBe("INVITE");
    expect(stageForRoom("B", "B_DRAFTING")).toBe("RECORD");
    expect(stageForRoom("B", "COMMON_VIEW_READY")).toBe("COMMON");
    expect(stageForRoom("A", "AGREEMENT_PENDING")).toBe("AGREEMENT");
    expect(stageForRoom("B", "COMPLETED")).toBe("COMPLETE");
  });

  it("loads authoritative shared state after joining an in-progress room", () => {
    expect(shouldLoadSnapshotAfterJoin("DIALOGUE")).toBe(true);
    expect(shouldLoadSnapshotAfterJoin("AI_PENDING")).toBe(true);
    expect(shouldLoadSnapshotAfterJoin("COMMON")).toBe(true);
    expect(shouldLoadSnapshotAfterJoin("RECORD")).toBe(false);
    expect(shouldLoadSnapshotAfterJoin("INVITATION_INTRO")).toBe(false);
  });
});
