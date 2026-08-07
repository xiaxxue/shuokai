import type {
  AuthSession,
  Perspective,
  RoomSession,
  RoomSnapshot,
} from "../domain/types";
import type { RecordedAudio } from "./recorder";
import { createMockApi } from "./mock-api";
import { clearSession, getActiveRoom, getSession, saveSession } from "./session";

type RpcArgs = Record<string, string | number | boolean | null>;

type ApiResponse<T> = {
  statusCode: number;
  data: T;
};

function apiUrl(path: string) {
  return `${__API_BASE_URL__}${path}`;
}

function request<T>(options: Omit<UniApp.RequestOptions, "success" | "fail">) {
  return new Promise<ApiResponse<T>>((resolve, reject) => {
    uni.request({
      ...options,
      success: (response) => resolve(response as unknown as ApiResponse<T>),
      fail: (error) => reject(new Error(error.errMsg)),
    });
  });
}

function wechatLogin() {
  if (__PLATFORM__ !== "mp-weixin") {
    throw new Error("当前平台的正式登录方式尚未配置。");
  }
  return new Promise<string>((resolve, reject) => {
    uni.login({
      provider: "weixin",
      success: ({ code }) => code ? resolve(code) : reject(new Error("微信没有返回登录凭证，请重试。")),
      fail: (error) => reject(new Error(error.errMsg)),
    });
  });
}

function toAuthSession(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string };
}): AuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    userId: session.user.id,
  };
}

async function h5SupabaseClient() {
  if (!__SUPABASE_URL__ || !__SUPABASE_PUBLISHABLE_KEY__) {
    throw new Error("网页登录尚未配置。");
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(__SUPABASE_URL__, __SUPABASE_PUBLISHABLE_KEY__, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function errorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data && "message" in data) {
    return String((data as { message: unknown }).message);
  }
  return fallback;
}

function parseAuthSession(data: unknown): AuthSession {
  if (
    typeof data !== "object" ||
    data === null ||
    !("accessToken" in data) ||
    typeof data.accessToken !== "string" ||
    !("refreshToken" in data) ||
    typeof data.refreshToken !== "string" ||
    !("expiresAt" in data) ||
    typeof data.expiresAt !== "number" ||
    !("userId" in data) ||
    typeof data.userId !== "string"
  ) {
    throw new Error("登录服务返回了无效会话。");
  }
  return data as AuthSession;
}

async function requestPlatformSession(): Promise<AuthSession> {
  if (__USE_MOCK_API__) {
    const mock = {
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      userId: "00000000-0000-4000-8000-000000000001",
    };
    saveSession(mock);
    return mock;
  }

  if (__PLATFORM__ === "h5") {
    const client = await h5SupabaseClient();
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.session || !data.user) throw new Error("网页登录失败，请稍后重试。");
    const session = toAuthSession({ ...data.session, user: data.user });
    saveSession(session);
    return session;
  }

  const code = await wechatLogin();
  const response = await request<unknown>({
    url: apiUrl("/wechat-login"),
    method: "POST",
    header: { "content-type": "application/json" },
    data: { code },
    timeout: 15000,
  });
  if (response.statusCode !== 200) {
    throw new Error(errorMessage(response.data, "微信登录失败，请稍后重试。"));
  }
  const session = parseAuthSession(response.data);
  saveSession(session);
  return session;
}

async function refreshSession(session: AuthSession): Promise<AuthSession> {
  if (__USE_MOCK_API__) return session;
  if (__PLATFORM__ === "h5") {
    const client = await h5SupabaseClient();
    const { data, error } = await client.auth.refreshSession({ refresh_token: session.refreshToken });
    if (error || !data.session || !data.user) throw new Error("登录已失效，请重新打开页面。");
    const refreshed = toAuthSession({ ...data.session, user: data.user });
    saveSession(refreshed);
    return refreshed;
  }
  const response = await request<unknown>({
    url: apiUrl("/wechat-login"),
    method: "POST",
    header: { "content-type": "application/json" },
    data: { refreshToken: session.refreshToken },
    timeout: 15000,
  });
  if (response.statusCode !== 200) throw new Error("登录已失效，请重新进入小程序。");
  const refreshed = parseAuthSession(response.data);
  saveSession(refreshed);
  return refreshed;
}

let pendingSession: Promise<AuthSession> | null = null;

async function resolveSession() {
  const session = getSession();
  if (!session) return requestPlatformSession();
  if (session.expiresAt > Math.floor(Date.now() / 1000) + 60) return session;
  try {
    return await refreshSession(session);
  } catch {
    clearSession();
    return requestPlatformSession();
  }
}

export function loginForPlatform(): Promise<AuthSession> {
  if (!pendingSession) {
    pendingSession = resolveSession().finally(() => {
      pendingSession = null;
    });
  }
  return pendingSession;
}

async function activeSession() {
  return loginForPlatform();
}

let mockApi: ReturnType<typeof createMockApi> | null = null;

function activeMockApi() {
  if (!mockApi) mockApi = createMockApi(getActiveRoom() ?? undefined);
  return mockApi;
}

async function rpc<T>(name: string, args: RpcArgs): Promise<T> {
  if (__USE_MOCK_API__) return activeMockApi().call<T>(name, args);
  const session = await activeSession();
  const response = await request<T>({
    url: apiUrl("/miniapp-api"),
    method: "POST",
    header: {
      Authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    },
    data: { method: name, args },
    timeout: 20000,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(errorMessage(response.data, "操作没有完成，请稍后重试。"));
  }
  return response.data;
}

export const roomApi = {
  create: (displayName = "我") =>
    rpc<RoomSession>("create_room", { p_display_name: displayName }),
  join: (code: string, displayName = "我") =>
    rpc<RoomSession>("join_room", { p_code: code, p_display_name: displayName }),
  setGoal: (roomId: string, goal: string) =>
    rpc<{ state: "A_DRAFTING" }>("set_room_goal", {
      p_room_id: roomId,
      p_goal: goal,
    }),
  saveDraft: (roomId: string, transcript: string, clarification: string) =>
    rpc<{ state: "A_REVIEWING" | "B_REVIEWING" }>("save_private_draft", {
      p_room_id: roomId,
      p_transcript: transcript,
      p_clarification: clarification,
    }),
  approvePerspective: (roomId: string, perspective: Perspective) =>
    rpc<{ state: RoomSession["state"]; version: number }>("approve_perspective", {
      p_room_id: roomId,
      p_fact: perspective.fact,
      p_meaning: perspective.meaning,
      p_impact: perspective.impact,
      p_request: perspective.request,
    }),
  proposeAgreement: (roomId: string, proposal: string, reviewAt: string) =>
    rpc<{ state: "AGREEMENT_PENDING" }>("propose_agreement", {
      p_room_id: roomId,
      p_proposal: proposal,
      p_review_at: reviewAt,
    }),
  acceptAgreement: (roomId: string) =>
    rpc<{ state: "AGREEMENT_PENDING" | "COMPLETED"; activated: boolean }>(
      "accept_agreement",
      { p_room_id: roomId },
    ),
  simulatePartnerAcceptance: () => {
    if (!__USE_MOCK_API__) throw new Error("模拟操作只在本地演示模式可用。");
    return Promise.resolve(activeMockApi().simulatePartnerAcceptance());
  },
  snapshot: (roomId: string) =>
    rpc<RoomSnapshot>("get_room_snapshot", { p_room_id: roomId }),
};

async function uploadPath(audio: Extract<RecordedAudio, { kind: "path" }>, accessToken: string) {
  return new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
    uni.uploadFile({
      url: apiUrl("/transcribe"),
      filePath: audio.filePath,
      name: "file",
      header: { Authorization: `Bearer ${accessToken}` },
      formData: { language: "zh" },
      timeout: 120000,
      success: resolve,
      fail: (error) => reject(new Error(error.errMsg)),
    });
  });
}

async function uploadBlob(audio: Extract<RecordedAudio, { kind: "blob" }>, accessToken: string) {
  const form = new FormData();
  form.append("file", audio.blob, audio.fileName);
  form.append("language", "zh");
  const response = await fetch(apiUrl("/transcribe"), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  return { statusCode: response.status, data: await response.text() };
}

export async function transcribeAudio(audio: RecordedAudio) {
  if (__USE_MOCK_API__) {
    return "昨晚你临时改变了周末安排，我是到很晚才知道。我难过的不只是计划取消，而是觉得自己没有被提前考虑。";
  }
  const session = await activeSession();
  const result = audio.kind === "blob"
    ? await uploadBlob(audio, session.accessToken)
    : await uploadPath(audio, session.accessToken);
  let body: { text?: string; message?: string } = {};
  try {
    body = JSON.parse(result.data) as { text?: string; message?: string };
  } catch {
    // The API boundary is untrusted; fall through to the stable user-facing error.
  }
  if (result.statusCode !== 200 || !body.text) {
    throw new Error(body.message ?? "录音转写失败，请改用文字输入。");
  }
  return body.text;
}
