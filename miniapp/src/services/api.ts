import type {
  AuthSession,
  Perspective,
  RoomSession,
} from "../domain/types";
import type { EditableExpression, ExpressionMode } from "../domain/expression";
import {
  discoveryDimensions,
  isRepeatedDiscoveryQuestion,
  parseDiscoveryUnderstandingState,
  type ClarificationTurn,
} from "../domain/clarification";
import { parseDialogueState, type DialogueTurnKind } from "../domain/dialogue";
import { parseInvitationContext } from "../domain/invitation";
import { parseRoomHistoryPage, type RoomHistoryCursor } from "../domain/room-history";
import { parseUnderstandingConfirmation, parseUnderstandingStatus } from "../domain/understanding";
import {
  parseAcceptanceResult,
  parseApprovalResult,
  parseRoomSession,
  parseRoomSnapshot,
  parseStateResult,
} from "../domain/room-validation";
import type { RecordedAudio } from "./recorder";
import { requireH5Session } from "./auth";
import { clearSession, getSession, saveSession } from "./session";

type RpcArgs = Record<string, unknown>;

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
  if (__PLATFORM__ === "h5") return requireH5Session();
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

async function rpc<T>(name: string, args: RpcArgs): Promise<T> {
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
  create: async (displayName = "我") =>
    parseRoomSession(await rpc<unknown>("create_room_v2", { p_display_name: displayName })),
  join: async (code: string, displayName = "我") =>
    parseRoomSession(await rpc<unknown>("join_room_v2", { p_code: code, p_display_name: displayName })),
  history: async (cursor: RoomHistoryCursor | null = null, limit = 12) =>
    parseRoomHistoryPage(await rpc<unknown>("list_my_rooms_v2", {
      p_limit: limit,
      p_before_updated_at: cursor?.updatedAt ?? null,
      p_before_room_id: cursor?.roomId ?? null,
    })),
  setGoal: async (roomId: string, goal: string) =>
    parseStateResult(await rpc<unknown>("set_room_goal_v2", {
      p_room_id: roomId,
      p_goal: goal,
    }), ["A_DRAFTING"] as const),
  saveDraft: async (roomId: string, transcript: string, clarification: string) =>
    parseStateResult(await rpc<unknown>("save_private_draft", {
      p_room_id: roomId,
      p_transcript: transcript,
      p_clarification: clarification,
    }), ["A_REVIEWING", "B_REVIEWING"] as const),
  approvePerspective: async (roomId: string, perspective: Perspective) =>
    parseApprovalResult(await rpc<unknown>("approve_perspective", {
      p_room_id: roomId,
      p_fact: perspective.fact,
      p_meaning: perspective.meaning,
      p_impact: perspective.impact,
      p_request: perspective.request,
    })),
  proposeAgreement: async (roomId: string, proposal: string, reviewAt: string) =>
    parseStateResult(await rpc<unknown>("propose_agreement", {
      p_room_id: roomId,
      p_proposal: proposal,
      p_review_at: reviewAt,
    }), ["AGREEMENT_PENDING"] as const),
  acceptAgreement: async (roomId: string) =>
    parseAcceptanceResult(await rpc<unknown>(
      "accept_agreement",
      { p_room_id: roomId },
    )),
  snapshot: async (roomId: string) =>
    parseRoomSnapshot(await rpc<unknown>("get_room_snapshot", { p_room_id: roomId })),
  invitationContext: async (roomId: string) => {
    const session = await activeSession();
    const response = await request<unknown>({
      url: apiUrl("/room/invitation-context"),
      method: "POST",
      header: {
        Authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      data: { roomId },
      timeout: 15000,
    });
    if (response.statusCode !== 200) {
      throw new Error(errorMessage(response.data, "暂时无法读取这次邀请。"));
    }
    return parseInvitationContext(response.data);
  },
  expressionWorkspace: async (roomId: string) =>
    rpc<{
      revision: number;
      flowState: string;
      sourceText: string;
      selectedMode: ExpressionMode | null;
      manualPayload: Record<string, string>;
      aiCandidate: unknown;
    }>("get_expression_workspace_v2", { p_room_id: roomId }),
  aiJobStatus: async (jobId: string) =>
    rpc<{
      jobId: string;
      status: "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED_RETRYABLE" | "FAILED_FINAL" | "STALE" | "CANCELED";
      draftRevision: number;
      result: unknown;
      errorCode: string | null;
    }>("get_ai_job_status_v2", { p_job_id: jobId }),
  understandingStatus: async (roomId: string) =>
    parseUnderstandingStatus(await rpc<unknown>("get_understanding_status_v2", { p_room_id: roomId })),
  startDialogue: async (roomId: string) => {
    await rpc("start_dialogue_v2", { p_room_id: roomId });
    return parseDialogueState(await rpc<unknown>("get_dialogue_state_v2", { p_room_id: roomId }));
  },
  dialogueState: async (roomId: string) =>
    parseDialogueState(await rpc<unknown>("get_dialogue_state_v2", { p_room_id: roomId })),
  appendDialogueTurn: async (
    roomId: string,
    revision: number,
    kind: Extract<DialogueTurnKind, "REFLECTION" | "REFLECTION_CONFIRMATION" | "RESPONSE">,
    replyToTurnId: string,
    payload: Record<string, unknown>,
  ) => rpc<{ turnId: string; revision: number }>("append_dialogue_turn_v2", {
    p_room_id: roomId,
    p_expected_revision: revision,
    p_turn_kind: kind,
    p_reply_to_turn_id: replyToTurnId,
    p_payload: payload,
  }),
  confirmUnderstanding: async (
    roomId: string,
    resultId: string,
    candidateHash: string,
    decision: "ACCURATE" | "INACCURATE",
    feedbackText = "",
  ) => parseUnderstandingConfirmation(await rpc<unknown>("confirm_understanding_v2", {
    p_room_id: roomId,
    p_result_id: resultId,
    p_candidate_hash: candidateHash,
    p_decision: decision,
    p_feedback_text: feedbackText,
  })),
  reopenExpression: async (roomId: string) =>
    rpc<{ state: RoomSession["state"]; phase: "PRIVATE_EXPRESSION" }>(
      "reopen_expression_v2",
      { p_room_id: roomId },
    ),
  confirmExpression: async (roomId: string, revision: number, payload: Record<string, unknown>) =>
    rpc<{ state: RoomSession["state"]; version: number; expressionId: string }>(
      "confirm_expression_version_v2",
      { p_room_id: roomId, p_expected_revision: revision, p_payload: payload },
    ),
  pause: async (roomId: string) =>
    rpc<{ phase: "PAUSED"; paused: true }>("pause_room_v2", { p_room_id: roomId }),
  saveExpressionWorkspace: async (
    roomId: string,
    expectedRevision: number,
    sourceText: string,
    selectedMode: ExpressionMode,
    manualPayload: Record<string, string>,
  ) => rpc<{ revision: number; sourceHash: string; selectedMode: ExpressionMode }>(
    "save_expression_workspace_v2",
    {
      p_room_id: roomId,
      p_expected_revision: expectedRevision,
      p_source_text: sourceText,
      p_selected_mode: selectedMode,
      p_manual_payload: manualPayload,
    },
  ),
};

export async function requestSharedUnderstanding(roomId: string) {
  const session = await activeSession();
  const response = await request<unknown>({
    url: apiUrl("/ai/understanding"),
    method: "POST",
    header: {
      Authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    },
    data: { roomId },
    timeout: 25000,
  });
  if (![200, 202].includes(response.statusCode) || !response.data || typeof response.data !== "object") {
    throw new UnderstandingRequestError(
      errorMessage(response.data, "共同理解任务没有创建，双方表达仍已安全保留。"),
      response.statusCode >= 500,
    );
  }
  const result = response.data as { jobId?: unknown; status?: unknown };
  return {
    jobId: typeof result.jobId === "string" ? result.jobId : "",
    status: typeof result.status === "string" ? result.status : "SUCCEEDED",
  };
}

export class UnderstandingRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "UnderstandingRequestError";
  }
}

export async function requestExpressionOrganization(
  roomId: string,
  expectedRevision: number,
  sourceText: string,
  selectedMode: Exclude<ExpressionMode, "PAUSE">,
  manualPayload: EditableExpression["fields"] = {},
) {
  const session = await activeSession();
  const response = await request<unknown>({
    url: apiUrl("/ai/expression"),
    method: "POST",
    header: {
      Authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    },
    data: { roomId, expectedRevision, sourceText, selectedMode, manualPayload },
    timeout: 25000,
  });
  if (response.statusCode !== 202 || !response.data || typeof response.data !== "object") {
    throw new Error(errorMessage(response.data, "AI 整理任务没有创建，请改为手动填写。"));
  }
  const result = response.data as { jobId?: unknown; revision?: unknown };
  if (typeof result.jobId !== "string" || typeof result.revision !== "number") {
    throw new Error("AI 整理服务返回了无效任务，请改为手动填写。");
  }
  return { jobId: result.jobId, revision: result.revision };
}

export async function requestExpressionClarification(
  roomId: string,
  sourceText: string,
  turns: ClarificationTurn[],
) {
  const session = await activeSession();
  const response = await request<unknown>({
    url: apiUrl("/ai/clarify"),
    method: "POST",
    header: {
      Authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    },
    data: { roomId, sourceText, turns },
    timeout: 25000,
  });
  if (response.statusCode !== 200 || !response.data || typeof response.data !== "object") {
    throw new Error(errorMessage(response.data, "AI 暂时没有接住这句话，请稍后再试。"));
  }
  const result = response.data as Record<string, unknown>;
  const dispositions = ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"] as const;
  const understanding = parseDiscoveryUnderstandingState(result);
  const allCovered = Boolean(understanding && discoveryDimensions.every((dimension) =>
    understanding.coverage[dimension].status === "ENOUGH"));
  const safetyStopped = ["BLOCK_SHARE", "PAUSE"].includes(String(result.safetyDisposition));
  const hasStopped = Boolean(result.ready || result.followUpLimitReached || safetyStopped);
  const nextQuestion = understanding?.nextQuestion;
  if (!understanding || typeof result.ready !== "boolean" ||
    typeof result.followUpLimitReached !== "boolean" ||
    result.ready !== allCovered || (result.ready && result.followUpLimitReached) ||
    !dispositions.includes(result.safetyDisposition as typeof dispositions[number]) ||
    typeof result.safetyMessage !== "string" || result.safetyMessage.length > 1000 ||
    (turns.length === 0
      ? understanding.latestAnswerUpdate.absorbed || understanding.latestAnswerUpdate.updatedDimensions.length > 0
      : !understanding.latestAnswerUpdate.absorbed) ||
    (hasStopped
      ? nextQuestion?.focusDimension !== "none" || Boolean(nextQuestion.text.trim()) ||
        Boolean(nextQuestion.purpose.trim())
      : nextQuestion?.focusDimension === "none" || !nextQuestion?.text.trim() ||
        !nextQuestion.purpose.trim() ||
        understanding.coverage[nextQuestion.focusDimension].status !== "MISSING" ||
        isRepeatedDiscoveryQuestion(nextQuestion.text, turns))) {
    throw new Error("AI 私人对话返回了无效内容，请稍后重试。");
  }
  return {
    question: understanding.nextQuestion.text,
    ready: result.ready,
    followUpLimitReached: result.followUpLimitReached,
    understanding,
    safetyDisposition: result.safetyDisposition as typeof dispositions[number],
    safetyMessage: result.safetyMessage,
  };
}

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
