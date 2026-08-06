import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let stopCallback: ((result: { tempFilePath: string }) => void) | undefined;
  let errorCallback: ((error: { errMsg: string }) => void) | undefined;
  const manager = {
    onStop: vi.fn((callback: typeof stopCallback) => {
      stopCallback = callback;
    }),
    onError: vi.fn((callback: typeof errorCallback) => {
      errorCallback = callback;
    }),
    start: vi.fn(),
    stop: vi.fn(),
  };
  return {
    manager,
    emitStop: (tempFilePath: string) => stopCallback?.({ tempFilePath }),
    emitError: (errMsg: string) => errorCallback?.({ errMsg }),
  };
});

vi.mock("@tarojs/taro", () => ({
  default: {
    getRecorderManager: () => mocks.manager,
    getSetting: vi.fn().mockResolvedValue({ authSetting: { "scope.record": true } }),
    openSetting: vi.fn(),
    authorize: vi.fn(),
  },
}));

import { startRecording, stopRecording } from "../src/services/recorder";

describe("recorder lifecycle", () => {
  beforeEach(() => {
    mocks.manager.start.mockClear();
    mocks.manager.stop.mockClear();
  });

  it("resolves when WeChat automatically stops at the duration limit", async () => {
    const { completion } = await startRecording();
    mocks.emitStop("/tmp/auto-stop.mp3");

    await expect(completion).resolves.toBe("/tmp/auto-stop.mp3");
  });

  it("uses the same completion when the user stops manually", async () => {
    const { completion } = await startRecording();
    stopRecording();
    mocks.emitStop("/tmp/manual-stop.mp3");

    expect(mocks.manager.stop).toHaveBeenCalledTimes(1);
    await expect(completion).resolves.toBe("/tmp/manual-stop.mp3");
  });

  it("rejects the active recording when WeChat reports an error", async () => {
    const { completion } = await startRecording();
    const rejection = expect(completion).rejects.toThrow("microphone interrupted");
    mocks.emitError("microphone interrupted");

    await rejection;
  });
});
