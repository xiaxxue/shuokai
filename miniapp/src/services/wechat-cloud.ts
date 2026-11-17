import type { RecordedAudio } from "./recorder";

type CloudResponse<T> = { statusCode: number; data: T };
type CloudInvocation = {
  path: string;
  method: string;
  data: unknown;
  authorization?: string;
};

// Only the small native surface used here is declared; no SDK is bundled into H5.
declare const wx: {
  cloud?: {
    init(options: { env: string; traceUser: boolean }): void;
    callFunction(options: { name: string; data: CloudInvocation; config: { env: string } }): Promise<{ result: unknown }>;
  };
  getFileSystemManager(): {
    readFile(options: {
      filePath: string;
      encoding: "base64";
      success(result: { data: string | ArrayBuffer }): void;
      fail(error: { errMsg: string }): void;
    }): void;
  };
};

let initialized = false;

function cloudApi() {
  if (typeof wx === "undefined" || !wx.cloud) {
    throw new Error("当前微信版本不支持云服务，请更新微信后重试。");
  }
  if (!__WECHAT_CLOUD_ENV__) throw new Error("小程序云服务尚未配置。");
  if (!initialized) {
    wx.cloud.init({ env: __WECHAT_CLOUD_ENV__, traceUser: false });
    initialized = true;
  }
  return wx.cloud;
}

export async function cloudRequest<T>(invocation: CloudInvocation, timeout = 20000): Promise<CloudResponse<T>> {
  const cloud = cloudApi();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { result } = await Promise.race([
      cloud.callFunction({
        name: "shuokaiGateway",
        config: { env: __WECHAT_CLOUD_ENV__ },
        data: invocation,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("cloud request timeout")), timeout);
      }),
    ]);
    if (!result || typeof result !== "object" || !("statusCode" in result) ||
        typeof result.statusCode !== "number" || !Number.isInteger(result.statusCode) ||
        result.statusCode < 100 || result.statusCode > 599 || !("data" in result)) {
      throw new Error("云服务返回了无效结果，请稍后重试。");
    }
    return result as CloudResponse<T>;
  } catch (error) {
    if (error instanceof Error) throw error;
    // Native SDK failures may contain diagnostic details; never expose or log the object.
    throw new Error("暂时无法连接说开，请稍后重试。");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function cloudTranscribe(audio: Extract<RecordedAudio, { kind: "path" }>, accessToken: string) {
  const audioBase64 = await new Promise<string>((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: audio.filePath,
      encoding: "base64",
      success: ({ data }) => typeof data === "string"
        ? resolve(data)
        : reject(new Error("录音读取失败，请重新录音或改用文字输入。")),
      fail: () => reject(new Error("录音读取失败，请重新录音或改用文字输入。")),
    });
  });
  // Two minutes of the app's 48kbps MP3 fits well below this limit and the 5MB cloud payload cap.
  if (audioBase64.length > 4 * 1024 * 1024) {
    throw new Error("录音文件过大，请缩短录音后重试。");
  }
  const response = await cloudRequest<unknown>({
    path: "/transcribe",
    method: "POST",
    authorization: `Bearer ${accessToken}`,
    data: { audioBase64 },
  }, 65000);
  return { statusCode: response.statusCode, data: JSON.stringify(response.data) };
}
