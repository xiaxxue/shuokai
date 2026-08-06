import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = {
  stopCallback: undefined as ((result: { tempFilePath: string }) => void) | undefined,
  errorCallback: undefined as ((error: { errMsg: string }) => void) | undefined,
  manager: {
    onStop: vi.fn((callback: (result: { tempFilePath: string }) => void) => {
      mocks.stopCallback = callback;
    }),
    onError: vi.fn((callback: (error: { errMsg: string }) => void) => {
      mocks.errorCallback = callback;
    }),
    start: vi.fn(),
    stop: vi.fn(),
  },
};

vi.stubGlobal("uni", {
  getRecorderManager: () => mocks.manager,
  getSetting: ({ success }: { success: (value: unknown) => void }) => {
    success({ authSetting: { "scope.record": true } });
  },
  openSetting: vi.fn(),
  authorize: ({ success }: { success: () => void }) => success(),
});

import { startRecording, stopRecording } from "../src/services/recorder";

describe("recorder lifecycle", () => {
  beforeEach(() => {
    mocks.manager.start.mockClear();
    mocks.manager.stop.mockClear();
  });

  it("resolves when WeChat automatically stops at the duration limit", async () => {
    const { completion } = await startRecording();
    mocks.stopCallback?.({ tempFilePath: "/tmp/auto-stop.mp3" });

    await expect(completion).resolves.toEqual({
      kind: "path",
      filePath: "/tmp/auto-stop.mp3",
      fileName: "recording.mp3",
      mimeType: "audio/mpeg",
    });
  });

  it("uses the same completion when the user stops manually", async () => {
    const { completion } = await startRecording();
    stopRecording();
    mocks.stopCallback?.({ tempFilePath: "/tmp/manual-stop.mp3" });

    expect(mocks.manager.stop).toHaveBeenCalledTimes(1);
    await expect(completion).resolves.toMatchObject({ filePath: "/tmp/manual-stop.mp3" });
  });

  it("rejects the active recording when WeChat reports an error", async () => {
    const { completion } = await startRecording();
    const rejection = expect(completion).rejects.toThrow("microphone interrupted");
    mocks.errorCallback?.({ errMsg: "microphone interrupted" });

    await rejection;
  });
});
