import { describe, expect, it, vi } from "vitest";
import { runCommittedRoomEntry } from "../src/services/room-entry";

describe("committed room entry", () => {
  it("does not turn a committed membership into a retryable create failure", async () => {
    const commit = vi.fn(async () => ({ roomId: "room-1" }));
    const remember = vi.fn();
    const followupError = new Error("context unavailable");
    const outcome = await runCommittedRoomEntry(commit, remember, async () => { throw followupError; });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(remember).toHaveBeenCalledWith({ roomId: "room-1" });
    expect(outcome).toEqual({
      room: { roomId: "room-1" }, followup: null,
      rememberError: null, followupError,
    });
  });

  it("reports local persistence failure separately and still loads the committed room", async () => {
    const rememberError = new Error("storage full");
    const outcome = await runCommittedRoomEntry(
      async () => ({ roomId: "room-2" }),
      () => { throw rememberError; },
      async () => "RELATIONSHIP_SETUP",
    );
    expect(outcome).toEqual({
      room: { roomId: "room-2" }, followup: "RELATIONSHIP_SETUP",
      rememberError, followupError: null,
    });
  });

  it("still rejects when the authoritative membership operation itself fails", async () => {
    const commitError = new Error("create failed");
    const remember = vi.fn();
    await expect(runCommittedRoomEntry(
      async () => { throw commitError; },
      remember,
      async () => "unused",
    )).rejects.toBe(commitError);
    expect(remember).not.toHaveBeenCalled();
  });
});
