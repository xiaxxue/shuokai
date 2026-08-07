export type RecordedAudio =
  | { kind: "path"; filePath: string; fileName: string; mimeType: string }
  | { kind: "blob"; blob: Blob; fileName: string; mimeType: string };

type PendingRecording = {
  completion: Promise<RecordedAudio>;
  resolve: (audio: RecordedAudio) => void;
  reject: (error: Error) => void;
};

type PlatformRecorderManager = ReturnType<typeof uni.getRecorderManager>;

let pendingRecording: PendingRecording | null = null;
let platformManager: PlatformRecorderManager | null = null;
let webRecorder: MediaRecorder | null = null;
let webStream: MediaStream | null = null;
let webStopTimer: ReturnType<typeof setTimeout> | null = null;

function createPendingRecording() {
  let resolve!: (audio: RecordedAudio) => void;
  let reject!: (error: Error) => void;
  const completion = new Promise<RecordedAudio>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  pendingRecording = { completion, resolve, reject };
  return completion;
}

function finishWebRecording() {
  if (webStopTimer) clearTimeout(webStopTimer);
  webStopTimer = null;
  webStream?.getTracks().forEach((track) => track.stop());
  webStream = null;
  webRecorder = null;
}

function getPlatformManager() {
  if (platformManager) return platformManager;
  platformManager = uni.getRecorderManager();
  platformManager.onStop((result) => {
    const pending = pendingRecording;
    pendingRecording = null;
    pending?.resolve({
      kind: "path",
      filePath: result.tempFilePath,
      fileName: "recording.mp3",
      mimeType: "audio/mpeg",
    });
  });
  platformManager.onError((error) => {
    const pending = pendingRecording;
    pendingRecording = null;
    pending?.reject(new Error(error.errMsg));
  });
  return platformManager;
}

function callUni<T>(register: (success: (value: T) => void, fail: (error: { errMsg: string }) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    register(resolve, (error) => reject(new Error(error.errMsg)));
  });
}

export async function requestRecordPermission() {
  if (__PLATFORM__ !== "mp-weixin") return;
  const permission = await callUni<boolean | undefined>((success, fail) => {
    uni.getSetting({
      success: (result) => success(result.authSetting["scope.record"]),
      fail,
    });
  });
  if (permission === true) return;
  if (permission === false) {
    await callUni<void>((success, fail) => uni.openSetting({ success: () => success(), fail }));
    const nextPermission = await callUni<boolean | undefined>((success, fail) => {
      uni.getSetting({
        success: (result) => success(result.authSetting["scope.record"]),
        fail,
      });
    });
    if (!nextPermission) throw new Error("需要麦克风权限才能录音。");
    return;
  }
  await callUni<void>((success, fail) => uni.authorize({ scope: "scope.record", success, fail }));
}

async function startWebRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("当前浏览器不支持录音，请改用文字输入。");
  }
  webStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const supportedType = ["audio/webm;codecs=opus", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  try {
    webRecorder = new MediaRecorder(webStream, supportedType ? { mimeType: supportedType } : undefined);
  } catch {
    finishWebRecording();
    throw new Error("当前浏览器无法启动录音，请改用文字输入。");
  }
  const chunks: Blob[] = [];

  webRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  webRecorder.onerror = () => {
    const pending = pendingRecording;
    pendingRecording = null;
    finishWebRecording();
    pending?.reject(new Error("网页录音失败，请改用文字输入。"));
  };
  webRecorder.onstop = () => {
    const pending = pendingRecording;
    pendingRecording = null;
    const mimeType = webRecorder?.mimeType || supportedType || "audio/webm";
    const extension = mimeType.includes("mp4") ? "m4a" : "webm";
    const blob = new Blob(chunks, { type: mimeType });
    finishWebRecording();
    pending?.resolve({ kind: "blob", blob, fileName: `recording.${extension}`, mimeType });
  };
  try {
    webRecorder.start();
  } catch {
    finishWebRecording();
    throw new Error("网页录音启动失败，请改用文字输入。");
  }
  const completion = createPendingRecording();
  webStopTimer = setTimeout(() => {
    if (webRecorder?.state === "recording") webRecorder.stop();
  }, 120000);
  return { completion };
}

export async function startRecording() {
  if (pendingRecording) throw new Error("录音已经开始。");
  if (__PLATFORM__ === "h5") return startWebRecording();

  await requestRecordPermission();
  const completion = createPendingRecording();
  try {
    getPlatformManager().start({
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
  if (__PLATFORM__ === "h5") {
    if (webRecorder?.state === "recording") webRecorder.stop();
    return;
  }
  getPlatformManager().stop();
}
