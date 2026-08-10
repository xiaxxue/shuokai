import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, unknown>();
const login = vi.fn();
const request = vi.fn();

vi.stubGlobal("uni", {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
  login,
  request,
});

import { loginForPlatform } from "../src/services/api";
import {
  clearActiveRoom,
  clearEditorDraft,
  clearPrivateDeviceData,
  getActiveRoom,
  getEditorDraft,
  saveActiveRoom,
  saveEditorDraft,
} from "../src/services/session";

const sessionKey = "shuokai.session.v2";
const freshSession = {
  accessToken: "fresh-access",
  refreshToken: "fresh-refresh",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  userId: "00000000-0000-4000-8000-000000000002",
};

function loginSucceeds(code: string) {
  login.mockImplementation(({ success }: { success: (result: { code: string }) => void }) => {
    success({ code });
  });
}

function requestReturns(statusCode: number, data: unknown) {
  return ({ success }: { success: (result: { statusCode: number; data: unknown }) => void }) => {
    success({ statusCode, data });
  };
}

describe("wechat session recovery", () => {
  beforeEach(() => {
    storage.clear();
    login.mockReset();
    request.mockReset();
  });

  it("clears an expired refresh token and creates a new WeChat session", async () => {
    storage.set(sessionKey, {
      ...freshSession,
      accessToken: "expired-access",
      refreshToken: "expired-refresh",
      expiresAt: 1,
    });
    request
      .mockImplementationOnce(requestReturns(401, { message: "expired" }))
      .mockImplementationOnce(requestReturns(200, freshSession));
    loginSucceeds("one-time-code");

    await expect(loginForPlatform()).resolves.toEqual(freshSession);
    expect(login).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(storage.get(sessionKey)).toEqual(freshSession);
  });

  it("deduplicates concurrent login requests", async () => {
    loginSucceeds("one-time-code");
    request.mockImplementation(requestReturns(200, freshSession));

    const first = loginForPlatform();
    const second = loginForPlatform();

    await expect(Promise.all([first, second])).resolves.toEqual([freshSession, freshSession]);
    expect(login).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("active room recovery", () => {
  beforeEach(() => storage.clear());

  it("persists and clears the room needed to resume a mobile flow", () => {
    const room = {
      roomId: "11111111-1111-4111-8111-111111111111",
      code: "SAY2026",
      role: "A" as const,
      state: "WAITING_FOR_B" as const,
    };

    expect(getActiveRoom()).toBeNull();
    saveActiveRoom(room, freshSession.userId);
    expect(getActiveRoom(freshSession.userId)).toEqual(room);
    clearActiveRoom();
    expect(getActiveRoom(freshSession.userId)).toBeNull();
  });

  it("does not restore a room after switching to another authenticated user", () => {
    const room = {
      roomId: "11111111-1111-4111-8111-111111111111",
      code: "SAY2026",
      role: "A" as const,
      state: "WAITING_FOR_B" as const,
    };

    saveActiveRoom(room, freshSession.userId);
    expect(getActiveRoom("00000000-0000-4000-8000-000000000099")).toBeNull();
    expect(getActiveRoom(freshSession.userId)).toEqual(room);
  });

  it("ignores malformed room data from local storage", () => {
    storage.set("shuokai.active-room.v1", {
      roomId: "not-a-complete-room",
      code: "SAY2026",
      role: "A",
      state: "UNKNOWN_STATE",
    });

    expect(getActiveRoom()).toBeNull();
  });
});

describe("private editor draft recovery", () => {
  beforeEach(() => storage.clear());

  it("restores in-progress text and cards only for the same room role", () => {
    const draft = {
      roomId: "11111111-1111-4111-8111-111111111111",
      role: "A" as const,
      transcript: "还没有提交的原话",
      clarification: "最希望对方理解的事",
      editorStage: "NVC_NEED" as const,
      perspective: {
        fact: "观察到的事实",
        meaning: "我的感受",
        impact: "我的需要",
        request: "具体请求",
      },
    };

    saveEditorDraft(draft);
    expect(getEditorDraft(draft.roomId, "A")).toEqual(draft);
    expect(getEditorDraft(draft.roomId, "B")).toBeNull();
    clearEditorDraft();
    expect(getEditorDraft(draft.roomId, "A")).toBeNull();
  });

  it("rejects oversized cached private text", () => {
    storage.set("shuokai.editor-draft.v1", {
      roomId: "11111111-1111-4111-8111-111111111111",
      role: "A",
      transcript: "a".repeat(12001),
      clarification: "",
      perspective: { fact: "", meaning: "", impact: "", request: "" },
    });

    expect(getEditorDraft("11111111-1111-4111-8111-111111111111", "A")).toBeNull();
  });

  it("restores a private v2 expression candidate without exposing it as room state", () => {
    const draft = {
      roomId: "11111111-1111-4111-8111-111111111111",
      role: "A" as const,
      transcript: "我们约好周五确认，但周日仍没有消息。",
      clarification: "",
      perspective: { fact: "", meaning: "", impact: "", request: "" },
      editorStage: "EXPRESSION_REVIEW" as const,
      selectedMode: "NVC" as const,
      editableExpression: {
        mode: "NVC" as const,
        fields: { observation: "周日仍未收到消息", feeling: "失望", need: "确定感", request: "当天告诉我" },
        uncertainties: [],
        safetyDisposition: "ALLOW" as const,
        safetyMessage: "",
      },
      workspaceRevision: 2,
      aiJobId: "22222222-2222-4222-8222-222222222222",
    };
    saveEditorDraft(draft);
    expect(getEditorDraft(draft.roomId, "A")).toMatchObject({
      selectedMode: "NVC",
      workspaceRevision: 2,
      aiJobId: draft.aiJobId,
      editableExpression: draft.editableExpression,
    });
  });

  it("migrates a legacy clarification into the feeling card", () => {
    storage.set("shuokai.editor-draft.v1", {
      roomId: "11111111-1111-4111-8111-111111111111",
      role: "A",
      transcript: "旧版本保存的原话",
      clarification: "旧版本保存的感受",
      perspective: { fact: "", meaning: "", impact: "", request: "" },
    });

    expect(
      getEditorDraft("11111111-1111-4111-8111-111111111111", "A")?.perspective.meaning,
    ).toBe("旧版本保存的感受");
  });

  it("rejects a cached draft that points outside the private editing flow", () => {
    storage.set("shuokai.editor-draft.v1", {
      roomId: "11111111-1111-4111-8111-111111111111",
      role: "A",
      transcript: "尚未分享的原话",
      clarification: "",
      perspective: { fact: "", meaning: "", impact: "", request: "" },
      editorStage: "AGREEMENT",
    });

    expect(getEditorDraft("11111111-1111-4111-8111-111111111111", "A")).toBeNull();
  });

  it("clears the local room and private draft together on account exit", () => {
    const room = {
      roomId: "11111111-1111-4111-8111-111111111111",
      code: "SAY2026",
      role: "A" as const,
      state: "A_DRAFTING" as const,
    };
    saveActiveRoom(room, freshSession.userId);
    saveEditorDraft({
      roomId: room.roomId,
      role: room.role,
      transcript: "只保存在本机的内容",
      clarification: "",
      perspective: { fact: "", meaning: "", impact: "", request: "" },
    });

    clearPrivateDeviceData();

    expect(getActiveRoom(freshSession.userId)).toBeNull();
    expect(getEditorDraft(room.roomId, room.role)).toBeNull();
  });
});
