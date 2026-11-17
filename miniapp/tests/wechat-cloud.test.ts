import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudRequest, cloudTranscribe } from "../src/services/wechat-cloud";

const callFunction = vi.fn();
const readFile = vi.fn();
vi.stubGlobal("wx", {
  cloud: { init: vi.fn(), callFunction },
  getFileSystemManager: () => ({ readFile }),
});
vi.stubGlobal("uni", { request: vi.fn(), uploadFile: vi.fn() });

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("WeChat cloud transport", () => {
  it("uses the designated cloud function and preserves application errors without direct HTTP", async () => {
    callFunction.mockResolvedValue({ result: { statusCode: 409, data: { code: "WORKSPACE_CONFLICT" } } });
    const input = { path: "/miniapp-api", method: "POST", data: { method: "create_room_v2" }, authorization: "Bearer user-jwt" };
    await expect(cloudRequest(input)).resolves.toMatchObject({ statusCode: 409 });
    expect(callFunction).toHaveBeenCalledWith({ name: "shuokaiGateway", config: { env: "shuokai-test-environment" }, data: input });
    expect(uni.request).not.toHaveBeenCalled();
  });

  it("rejects malformed cloud results", async () => {
    callFunction.mockResolvedValue({ result: { statusCode: "200", data: {} } });
    await expect(cloudRequest({ path: "/health", method: "GET", data: {} })).rejects.toThrow("无效结果");
  });

  it("bounds waiting for AI calls even when the native SDK does not return", async () => {
    vi.useFakeTimers();
    callFunction.mockImplementation(() => new Promise(() => {}));
    const result = cloudRequest({ path: "/ai/clarify", method: "POST", data: {} }, 60000);
    const rejection = expect(result).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(60000);
    await rejection;
  });

  it("sends MP3 bytes through the cloud function without persisting a recording in cloud storage", async () => {
    readFile.mockImplementation(({ success }) => success({ data: "YXVkaW8=" }));
    callFunction.mockResolvedValue({ result: { statusCode: 200, data: { text: "我想把话说清楚" } } });
    await expect(cloudTranscribe({ kind: "path", filePath: "/tmp/recording.mp3", fileName: "recording.mp3", mimeType: "audio/mpeg" }, "jwt"))
      .resolves.toEqual({ statusCode: 200, data: JSON.stringify({ text: "我想把话说清楚" }) });
    expect(callFunction.mock.calls[0][0].data).toEqual({ path: "/transcribe", method: "POST", authorization: "Bearer jwt", data: { audioBase64: "YXVkaW8=" } });
    expect(uni.uploadFile).not.toHaveBeenCalled();
  });

  it("rejects oversized recordings before invoking a paid cloud function", async () => {
    readFile.mockImplementation(({ success }) => success({ data: "A".repeat(4 * 1024 * 1024 + 4) }));
    await expect(cloudTranscribe({ kind: "path", filePath: "/tmp/large.mp3", fileName: "large.mp3", mimeType: "audio/mpeg" }, "jwt"))
      .rejects.toThrow("录音文件过大");
    expect(callFunction).not.toHaveBeenCalled();
  });
});
