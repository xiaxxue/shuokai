import Taro from "@tarojs/taro";
import type {
  AuthSession,
  Perspective,
  RoomSession,
  RoomSnapshot,
} from "../domain/types";
import { clearSession, getSession, saveSession } from "./session";

type RpcArgs = Record<string, string | number | boolean | null>;

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

async function requestWechatSession(): Promise<AuthSession> {
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

  const { code } = await Taro.login();
  if (!code) throw new Error("微信没有返回登录凭证，请重试。");
  const response = await Taro.request<unknown>({
    url: `${__API_BASE_URL__}/wechat-login`,
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
  const response = await Taro.request<unknown>({
    url: `${__API_BASE_URL__}/wechat-login`,
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
  if (!session) return requestWechatSession();
  if (session.expiresAt > Math.floor(Date.now() / 1000) + 60) return session;
  try {
    return await refreshSession(session);
  } catch {
    clearSession();
    return requestWechatSession();
  }
}

export function loginWithWechat(): Promise<AuthSession> {
  if (!pendingSession) {
    pendingSession = resolveSession().finally(() => {
      pendingSession = null;
    });
  }
  return pendingSession;
}

async function activeSession() {
  return loginWithWechat();
}

async function rpc<T>(name: string, args: RpcArgs): Promise<T> {
  if (__USE_MOCK_API__) return mockRpc<T>(name, args);
  const session = await activeSession();
  const response = await Taro.request<T>({
    url: `${__API_BASE_URL__}/miniapp-api`,
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

let mockRoom: RoomSession = {
  roomId: "11111111-1111-4111-8111-111111111111",
  code: "SAY2026",
  role: "A",
  state: "GOAL_SETTING",
};

function mockRpc<T>(name: string, args: RpcArgs): T {
  if (name === "create_room") {
    mockRoom = { ...mockRoom, role: "A", state: "GOAL_SETTING" };
    return mockRoom as T;
  }
  if (name === "set_room_goal") {
    mockRoom = { ...mockRoom, state: "A_DRAFTING" };
    return { state: mockRoom.state } as T;
  }
  if (name === "save_private_draft") {
    mockRoom = { ...mockRoom, state: "A_REVIEWING" };
    return { state: mockRoom.state } as T;
  }
  if (name === "approve_perspective") {
    mockRoom = {
      ...mockRoom,
      state: mockRoom.role === "A" ? "WAITING_FOR_B" : "COMMON_VIEW_READY",
    };
    return { state: mockRoom.state, version: 1 } as T;
  }
  if (name === "join_room") {
    mockRoom = { ...mockRoom, code: String(args.p_code), role: "B", state: "B_DRAFTING" };
    return mockRoom as T;
  }
  if (name === "get_room_snapshot") {
    const isShared = mockRoom.state === "COMMON_VIEW_READY";
    return {
      room: {
        id: mockRoom.roomId,
        code: mockRoom.code,
        state: mockRoom.state,
        goal: "让我被准确理解",
      },
      me: { id: "mock-participant", role: mockRoom.role, display_name: "我" },
      privateDraft: null,
      ownPerspective: null,
      approvedPerspectives: isShared
        ? [
            { role: "A", fact: "双方的计划发生了变化。", meaning: "我希望被提前告知。", impact: "我感到失落。", request: "变化时先告诉我。" },
            { role: "B", fact: "我在确认后告知了变化。", meaning: "我想避免过早制造焦虑。", impact: "我感到有解释压力。", request: "允许我先确认情况。" },
          ]
        : [],
      sharedView: isShared
        ? {
            common_ground: "双方都希望减少误解。",
            disagreement: "对于何时告知变化，双方期待不同。",
            core_question: "怎样既能提前同步不确定性，也保留确认情况的空间？",
          }
        : null,
    } as T;
  }
  throw new Error(`Mock RPC 尚未实现：${name}`);
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
    rpc<{ state: "A_REVIEWING" }>("save_private_draft", {
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
  snapshot: (roomId: string) =>
    rpc<RoomSnapshot>("get_room_snapshot", { p_room_id: roomId }),
};

export async function transcribeAudio(filePath: string) {
  if (__USE_MOCK_API__) {
    return "昨晚你临时改变了周末安排，我是到很晚才知道。我难过的不只是计划取消，而是觉得自己没有被提前考虑。";
  }
  const session = await activeSession();
  const result = await Taro.uploadFile({
    url: `${__API_BASE_URL__}/transcribe`,
    filePath,
    name: "file",
    header: { Authorization: `Bearer ${session.accessToken}` },
    formData: { language: "zh" },
    timeout: 120000,
  });
  let body: { text?: string; message?: string } = {};
  try {
    body = JSON.parse(result.data) as { text?: string; message?: string };
  } catch {
    // The API boundary is untrusted; fall through to the stable user-facing error.
  }
  if (result.statusCode !== 200 || !body.text) {
    throw new Error(body.message ?? "录音转写失败，请改用文字输入。 ");
  }
  return body.text;
}
