import Taro from "@tarojs/taro";
import type {
  AuthSession,
  Perspective,
  RoomSession,
  RoomSnapshot,
} from "../domain/types";
import { getSession, saveSession } from "./session";

type RpcArgs = Record<string, string | number | boolean | null>;

function errorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data && "message" in data) {
    return String((data as { message: unknown }).message);
  }
  return fallback;
}

export async function loginWithWechat(): Promise<AuthSession> {
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
  const response = await Taro.request<AuthSession>({
    url: `${__API_BASE_URL__}/wechat-login`,
    method: "POST",
    header: { "content-type": "application/json" },
    data: { code },
  });
  if (response.statusCode !== 200) {
    throw new Error(errorMessage(response.data, "微信登录失败，请稍后重试。"));
  }
  saveSession(response.data);
  return response.data;
}

async function refreshSession(session: AuthSession): Promise<AuthSession> {
  if (__USE_MOCK_API__) return session;
  const response = await Taro.request<AuthSession>({
    url: `${__API_BASE_URL__}/wechat-login`,
    method: "POST",
    header: { "content-type": "application/json" },
    data: { refreshToken: session.refreshToken },
  });
  if (response.statusCode !== 200) throw new Error("登录已失效，请重新进入小程序。");
  saveSession(response.data);
  return response.data;
}

async function activeSession() {
  let session = getSession() ?? (await loginWithWechat());
  if (session.expiresAt <= Math.floor(Date.now() / 1000) + 60) {
    session = await refreshSession(session);
  }
  return session;
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
  if (name === "create_room") return mockRoom as T;
  if (name === "set_room_goal") {
    mockRoom = { ...mockRoom, state: "A_DRAFTING" };
    return { state: mockRoom.state } as T;
  }
  if (name === "save_private_draft") {
    mockRoom = { ...mockRoom, state: "A_REVIEWING" };
    return { state: mockRoom.state } as T;
  }
  if (name === "approve_perspective") {
    mockRoom = { ...mockRoom, state: "WAITING_FOR_B" };
    return { state: mockRoom.state, version: 1 } as T;
  }
  if (name === "join_room") {
    return { ...mockRoom, code: String(args.p_code), role: "B", state: "B_DRAFTING" } as T;
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
    rpc<{ state: "WAITING_FOR_B"; version: number }>("approve_perspective", {
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
  });
  const body = JSON.parse(result.data) as { text?: string; message?: string };
  if (result.statusCode !== 200 || !body.text) {
    throw new Error(body.message ?? "录音转写失败，请改用文字输入。 ");
  }
  return body.text;
}
