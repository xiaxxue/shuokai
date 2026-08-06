import Taro from "@tarojs/taro";

const manager = Taro.getRecorderManager();

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
  manager.start({
    duration: 120000,
    sampleRate: 16000,
    numberOfChannels: 1,
    encodeBitRate: 48000,
    format: "mp3",
  });
}

export function stopRecording(): Promise<string> {
  return new Promise((resolve, reject) => {
    manager.onStop((result) => resolve(result.tempFilePath));
    manager.onError((error) => reject(new Error(error.errMsg)));
    manager.stop();
  });
}
