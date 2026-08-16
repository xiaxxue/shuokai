import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, unknown>();
const login = vi.fn();
const request = vi.fn();

vi.stubGlobal("uni", {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  login,
  request,
});

import { loginForPlatform, requestExpressionClarification } from "../src/services/api";
import {
  clearActiveRoom,
  clearEditorDraft,
  clearPrivateDeviceData,
  acknowledgeInvitation,
  getActiveRoom,
  getEditorDraft,
  hasAcknowledgedInvitation,
  saveActiveRoom,
  saveEditorDraft,
} from "../src/services/session";
import {
  clearProfileContextDraftsForUser,
  discardForeignProfileContextDrafts,
  getProfileDraft,
  getRelationshipDraft,
  saveProfileDraft,
  saveRelationshipDraft,
} from "../src/services/profile-context-session";

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

function requestFails(errMsg: string) {
  return ({ fail }: { fail: (error: { errMsg: string }) => void }) => {
    fail({ errMsg });
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

describe("AI clarification request recovery", () => {
  beforeEach(() => {
    storage.clear();
    request.mockReset();
    storage.set(sessionKey, freshSession);
  });

  it("turns a timeout into a recoverable user-facing error and allows the bounded model retry", async () => {
    request.mockImplementationOnce(requestFails("request:fail timeout"));

    const result = requestExpressionClarification(
      "11111111-1111-4111-8111-111111111111",
      2,
      "需要整理的原话",
      [],
    );

    await expect(result).rejects.toMatchObject({
      name: "ApiError",
      code: "AI_RESPONSE_TIMEOUT",
      message: "AI 这次理解得比较慢。你的内容仍在，请重新尝试；如果结果已经保存，会直接恢复，不会重复追问。",
    });
    expect(request.mock.calls[0]?.[0].timeout).toBe(60000);
  });

  it("keeps non-timeout network failures separate from slow AI responses", async () => {
    request.mockImplementationOnce(requestFails("request:fail network error"));

    await expect(requestExpressionClarification(
      "11111111-1111-4111-8111-111111111111",
      2,
      "需要整理的原话",
      [],
    )).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
      message: "没有连接到 AI。请检查网络后重试，或按现有内容继续整理。",
    });
  });

  it("preserves the server error code while offering recovery", async () => {
    request.mockImplementationOnce(requestReturns(502, {
      code: "AI_CLARIFICATION_FAILED",
      message: "AI 暂时没有接住这句话，请稍后再试。",
    }));

    await expect(requestExpressionClarification(
      "11111111-1111-4111-8111-111111111111",
      2,
      "需要整理的原话",
      [],
    )).rejects.toEqual(expect.objectContaining({
      code: "AI_CLARIFICATION_FAILED",
      message: "AI 暂时没有接住这句话，请稍后再试。",
    }));
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

  it("remembers that the receiver has read the invitation on this device", () => {
    const roomId = "11111111-1111-4111-8111-111111111111";
    expect(hasAcknowledgedInvitation(roomId)).toBe(false);
    acknowledgeInvitation(roomId);
    expect(hasAcknowledgedInvitation(roomId)).toBe(true);
    clearPrivateDeviceData();
    expect(hasAcknowledgedInvitation(roomId)).toBe(false);
  });
});

describe("profile context draft isolation", () => {
  beforeEach(() => storage.clear());

  it("never restores a profile draft for another account", () => {
    const otherUser = "00000000-0000-4000-8000-000000000099";
    const draft = {
      displayName: "小雨", responseLength: "SHORT" as const, language: "简体中文",
      useResponseLengthAi: true, useLanguageAi: false,
    };
    saveProfileDraft(freshSession.userId, draft);
    expect(getProfileDraft(freshSession.userId)).toEqual(draft);
    expect(getProfileDraft(otherUser)).toBeNull();
    discardForeignProfileContextDrafts(otherUser);
    expect(getProfileDraft(freshSession.userId)).toBeNull();
  });

  it("binds a relationship draft to user, room, and role", () => {
    const roomId = "11111111-1111-4111-8111-111111111111";
    const draft = {
      step: 2,
      sharedRevision: 1,
      privateRevision: 0,
      shared: {
        relationshipType: "PARTNER" as const, relationshipOther: null,
        durationRange: "Y1_3" as const, interactionMode: "MIXED" as const, useSharedAi: true,
      },
      mine: {
        relationshipType: null, relationshipOther: null, durationRange: null, interactionMode: null,
        communicationPace: "PAUSE_FIRST" as const, responsePreference: null, planningStyle: null,
        relationshipState: null, observedDifference: "", culturalContext: "",
        useCommunicationAi: true, useRelationshipStateAi: true, useDifferenceAi: true,
        useCultureAi: false, useInviterSharedAi: false,
      },
    };
    saveRelationshipDraft(freshSession.userId, roomId, "A", draft);
    expect(getRelationshipDraft(freshSession.userId, roomId, "A")).toEqual(draft);
    expect(getRelationshipDraft(freshSession.userId, roomId, "B")).toBeNull();
    clearProfileContextDraftsForUser(freshSession.userId);
    expect(getRelationshipDraft(freshSession.userId, roomId, "A")).toBeNull();
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

  it("keeps drafts from different rooms and clears only the requested one", () => {
    const first = {
      roomId: "11111111-1111-4111-8111-111111111111",
      role: "A" as const,
      transcript: "第一间房的私人对话",
      clarification: "",
      perspective: { fact: "", meaning: "", impact: "", request: "" },
    };
    const second = {
      ...first,
      roomId: "22222222-2222-4222-8222-222222222222",
      role: "B" as const,
      transcript: "第二间房的私人对话",
    };

    saveEditorDraft(first);
    saveEditorDraft(second);
    clearEditorDraft(first.roomId, first.role);

    expect(getEditorDraft(first.roomId, first.role)).toBeNull();
    expect(getEditorDraft(second.roomId, second.role)).toEqual(second);
  });

  it("persists a confirmed discard of a detached cross-device draft", () => {
    const draft = {
      roomId: "11111111-1111-4111-8111-111111111111",
      role: "A" as const,
      transcript: "当前对话",
      clarification: "",
      perspective: { fact: "", meaning: "", impact: "", request: "" },
      detachedDiscoveryDrafts: [{ answer: "需要丢弃的旧草稿", question: "旧问题", revision: 2 }],
    };
    saveEditorDraft(draft);
    saveEditorDraft({
      ...draft,
      detachedDiscoveryDrafts: [],
    });

    expect(getEditorDraft(draft.roomId, draft.role)).toMatchObject({
      detachedDiscoveryDrafts: [],
    });
  });

  it("round-trips two near-limit detached drafts without combining or truncating them", () => {
    const detachedDiscoveryDrafts = [
      { answer: "甲".repeat(1199), question: "第一个旧问题", revision: 2 },
      { answer: "乙".repeat(1200), question: "第二个旧问题", revision: 3 },
    ];
    const draft = {
      roomId: "11111111-1111-4111-8111-111111111111",
      role: "A" as const,
      transcript: "当前对话",
      clarification: "",
      perspective: { fact: "", meaning: "", impact: "", request: "" },
      detachedDiscoveryDrafts,
    };
    saveEditorDraft(draft);
    expect(getEditorDraft(draft.roomId, draft.role)?.detachedDiscoveryDrafts)
      .toEqual(detachedDiscoveryDrafts);
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
        fieldOwnership: {
          observation: "AI_DRAFT" as const,
          feeling: "AI_DRAFT" as const,
          need: "AI_DRAFT" as const,
          request: "AI_DRAFT" as const,
        },
        userEditedInvitationFields: [],
        invitation: {
          ready: true,
          title: "关于周日仍未收到消息",
          summary: "我们约好周五确认，但到周日仍没有消息。这份邀请希望你也讲讲自己记得的情况和期待。",
          sourceHash: "",
          generatedByAi: false,
        },
        uncertainties: [],
        safetyDisposition: "ALLOW" as const,
        safetyMessage: "",
      },
      workspaceRevision: 2,
      aiJobId: "22222222-2222-4222-8222-222222222222",
      clarificationTurns: [{ question: "当时具体说了什么？", answer: "他说另一个女生很好看。" }],
      modeSelectionTurnCount: 1,
      clarificationAnswer: "还没提交的回答",
      clarificationSkipped: false,
      discoveryStarted: true,
      discoveryConversationRevision: 4,
      detachedDiscoveryDrafts: [{ answer: "尚未发送的旧问题回答", question: "旧问题是什么？", revision: 3 }],
      discoveryQuestion: "你当时具体说了什么？",
      discoveryReady: false,
      discoveryModeSelectionOpen: true,
      discoveryFollowUpLimitReached: false,
      discoveryUnderstanding: {
        schemaVersion: 2 as const,
        coverage: {
          event: { status: "ENOUGH" as const, evidence: ["当时具体说了什么"], missingInfo: "" },
          userImpact: { status: "MISSING" as const, evidence: [], missingInfo: "缺少用户本人的感受或后果" },
          communicationGoal: { status: "MISSING" as const, evidence: [], missingInfo: "缺少沟通意图" },
        },
        latestAnswerUpdate: { absorbed: true, updatedDimensions: ["event" as const] },
        nextQuestion: {
          focusDimension: "userImpact" as const,
          text: "这件事对你造成了什么影响？",
          purpose: "补充具体影响",
        },
      },
      discoverySafetyDisposition: "ALLOW" as const,
      discoverySafetyMessage: "",
    };
    saveEditorDraft(draft);
    expect(getEditorDraft(draft.roomId, "A")).toMatchObject({
      selectedMode: "NVC",
      workspaceRevision: 2,
      aiJobId: draft.aiJobId,
      editableExpression: draft.editableExpression,
      clarificationTurns: draft.clarificationTurns,
      modeSelectionTurnCount: 1,
      clarificationAnswer: draft.clarificationAnswer,
      clarificationSkipped: false,
      discoveryStarted: true,
      discoveryConversationRevision: 4,
      detachedDiscoveryDrafts: draft.detachedDiscoveryDrafts,
      discoveryQuestion: draft.discoveryQuestion,
      discoveryReady: false,
      discoveryModeSelectionOpen: true,
      discoveryUnderstanding: draft.discoveryUnderstanding,
      discoverySafetyDisposition: "ALLOW",
      discoverySafetyMessage: "",
    });
  });

  it("restarts a legacy incomplete discovery draft that stopped without a next question", () => {
    const draft = {
      roomId: "11111111-1111-4111-8111-111111111111",
      role: "A" as const,
      transcript: "我们还没有把事情讲清楚。",
      clarification: "",
      perspective: { fact: "", meaning: "", impact: "", request: "" },
      editorStage: "RECORD" as const,
      clarificationTurns: Array.from({ length: 9 }, (_, index) => ({
        question: `问题 ${index + 1}`,
        answer: `回答 ${index + 1}`,
      })),
      discoveryStarted: true,
      discoveryQuestion: "",
      discoveryReady: false,
      discoveryFollowUpLimitReached: true,
      discoverySafetyDisposition: "ALLOW" as const,
      discoverySafetyMessage: "",
    };
    saveEditorDraft(draft);

    const restored = getEditorDraft(draft.roomId, "A");

    expect(restored?.discoveryStarted).toBe(false);
    expect(restored?.clarificationTurns).toHaveLength(9);
    expect(restored).not.toHaveProperty("discoveryFollowUpLimitReached");
  });

  it("clamps the saved path-selection boundary to valid private turns", () => {
    const draft = {
      roomId: "11111111-1111-4111-8111-111111111111",
      role: "A" as const,
      transcript: "需要继续整理的原话",
      clarification: "",
      perspective: { fact: "", meaning: "", impact: "", request: "" },
      clarificationTurns: [{ question: "发生了什么？", answer: "我们吵架了。" }],
      modeSelectionTurnCount: 99,
    };
    saveEditorDraft(draft);

    expect(getEditorDraft(draft.roomId, draft.role)?.modeSelectionTurnCount).toBe(1);
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
