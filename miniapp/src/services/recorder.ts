import Taro from "@tarojs/taro";

const manager = Taro.getRecorderManager();

type PendingRecording = {
  completion: Promise<string>;
  resolve: (filePath: string) => void;
  reject: (error: Error) => void;
};

let pendingRecording: PendingRecording | null = null;

manager.onStop((result) => {
  const pending = pendingRecording;
  pendingRecording = null;
  pending?.resolve(result.tempFilePath);
});

manager.onError((error) => {
  const pending = pendingRecording;
  pendingRecording = null;
  pending?.reject(new Error(error.errMsg));
});

export async function requestRecordPermission() {
  const settings = await Taro.getSetting();
  if (settings.authSetting["scope.record"] === true) return;
  if (settings.authSetting["scope.record"] === false) {
    await Taro.openSetting();
    const next = await Taro.getSetting();
    if (!next.authSetting["scope.record"]) throw new Error("需要麦克风权限才能录音。");
    return;
  }
  await Taro.authorize({ scope: "scope.record" });
}

export async function startRecording() {
  await requestRecordPermission();
  if (pendingRecording) throw new Error("录音已经开始。");

  let resolve!: (filePath: string) => void;
  let reject!: (error: Error) => void;
  const completion = new Promise<string>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  pendingRecording = { completion, resolve, reject };

  try {
    manager.start({
      duration: 120000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: "mp3",
    });
  } catch (error) {
    pendingRecording = null;
    throw error instanceof Error ? error : new Error("录音启动失败。");
  }

  return { completion };
}

export function stopRecording() {
  if (!pendingRecording) throw new Error("当前没有正在进行的录音。");
  manager.stop();
}
