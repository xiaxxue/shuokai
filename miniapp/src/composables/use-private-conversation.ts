import { computed, ref, type Ref } from "vue";
import type { ClientStage } from "../domain/room-state";
import type { RoomSession } from "../domain/types";
import {
  appendConversationTurn,
  composeConversationSource,
  conversationReplyFromCandidate,
  conversationTranscript,
  conversationUserTurns,
  createPrivateConversation,
  type ConversationTurn,
} from "../domain/conversation";
import { createEditableExpression, type EditableExpression, type ExpressionMode } from "../domain/expression";
import { requestExpressionOrganization, roomApi } from "../services/api";
import { clearEditorDraft } from "../services/session";
import type { DraftSaveState } from "../domain/account-status";
import type { Notice } from "../services/notice";

type PrivateConversationOptions = {
  room: Ref<RoomSession | null>;
  stage: Ref<ClientStage>;
  busy: Ref<boolean>;
  recording: Ref<boolean>;
  transcript: Ref<string>;
  selectedMode: Ref<ExpressionMode | null>;
  editableExpression: Ref<EditableExpression>;
  workspaceRevision: Ref<number>;
  aiJobId: Ref<string>;
  aiJobPurpose: Ref<"CONVERSATION" | "FINAL">;
  clarificationSkipped: Ref<boolean>;
  draftSaveState: Ref<DraftSaveState>;
  contentScrollTop: Ref<number>;
  updateRoom: (room: RoomSession) => void;
  setNotice: (kind: Notice["kind"], text: string) => void;
  clearNotice: () => void;
  formatError: (error: unknown, fallback: string) => string;
  confirmPause: () => Promise<boolean>;
  pollExpressionJob: (jobId: string) => Promise<void>;
  stopExpressionJobPolling: () => void;
};

export function usePrivateConversation(options: PrivateConversationOptions) {
  const turns = ref<ConversationTurn[]>(createPrivateConversation());
  const composer = ref("");
  const guidancePaused = ref(false);
  const replying = ref(false);

  const transcriptText = computed(() => conversationTranscript(turns.value));
  const userTurnCount = computed(() => conversationUserTurns(turns.value).length);
  const draftStatus = computed(() => {
    if (replying.value) return "正在等待私人回应";
    if (options.draftSaveState.value === "saving") return "正在保存到此设备";
    if (options.draftSaveState.value === "saved") return "已保存到此设备";
    return "发送后会保存为私人草稿";
  });

  function scrollToLatest() {
    options.contentScrollTop.value += 100000;
  }

  function appendAiMessage(turn: Omit<ConversationTurn, "id" | "role">) {
    try {
      turns.value = appendConversationTurn(turns.value, { role: "AI", ...turn });
      scrollToLatest();
      return true;
    } catch (error) {
      options.setNotice("info", options.formatError(error, "这段对话已经很长了，可以先整理当前内容。"));
      return false;
    }
  }

  function appendCandidateReply(expression: EditableExpression) {
    const reply = conversationReplyFromCandidate(
      expression,
      turns.value
        .filter((turn) => turn.role === "AI" && turn.kind === "QUESTION")
        .map((turn) => turn.text),
    );
    appendAiMessage(reply);
    options.transcript.value = transcriptText.value;
  }

  async function ensureRoomReady() {
    if (!options.room.value) throw new Error("当前私人空间已经失效，请返回首页重试。 ");
    if (options.room.value.role !== "A" || options.room.value.state !== "GOAL_SETTING") return;
    const result = await roomApi.setGoal(options.room.value.roomId, "先把这次想聊的事情说清楚");
    options.updateRoom({ ...options.room.value, state: result.state, phaseV2: "PRIVATE_EXPRESSION" });
  }

  async function send() {
    const text = composer.value.trim();
    if (!text) return;
    composer.value = "";
    await submitText(text);
  }

  async function submitText(text: string) {
    if (!options.room.value || options.busy.value || options.recording.value) return;
    options.clearNotice();
    let nextTurns: ConversationTurn[];
    try {
      nextTurns = appendConversationTurn(turns.value, { role: "USER", kind: "USER_INPUT", text });
      composeConversationSource(nextTurns);
    } catch (error) {
      options.setNotice("error", options.formatError(error, "这一段暂时无法加入私人对话。"));
      return;
    }

    turns.value = nextTurns;
    options.transcript.value = conversationTranscript(nextTurns);
    scrollToLatest();
    options.busy.value = true;
    try {
      await ensureRoomReady();
      const room = options.room.value;
      if (!room) throw new Error("当前私人空间已经失效，请返回首页重试。 ");
      const sourceText = composeConversationSource(nextTurns);
      options.selectedMode.value = "NVC";
      if (guidancePaused.value) {
        const saved = await roomApi.saveExpressionWorkspace(
          room.roomId,
          options.workspaceRevision.value,
          sourceText,
          "NVC",
          options.editableExpression.value.fields,
        );
        options.workspaceRevision.value = saved.revision;
        options.editableExpression.value = createEditableExpression("NVC");
        options.setNotice("success", "这一段已保存，AI 会先保持安静。 ");
        return;
      }

      options.aiJobPurpose.value = "CONVERSATION";
      replying.value = true;
      const job = await requestExpressionOrganization(
        room.roomId,
        options.workspaceRevision.value,
        sourceText,
        "NVC",
        options.editableExpression.value.fields,
      );
      options.workspaceRevision.value = job.revision;
      options.aiJobId.value = job.jobId;
      void options.pollExpressionJob(job.jobId);
    } catch (error) {
      replying.value = false;
      options.setNotice(
        "error",
        `${options.formatError(error, "这一段暂时没有同步。 ")}原话仍在本机私人草稿中，没有分享。`,
      );
    } finally {
      if (!replying.value) options.busy.value = false;
    }
  }

  async function finish() {
    if (!options.room.value || options.busy.value || !userTurnCount.value) return;
    options.clearNotice();
    options.busy.value = true;
    try {
      await ensureRoomReady();
      const room = options.room.value;
      if (!room) throw new Error("当前私人空间已经失效，请返回首页重试。 ");
      options.selectedMode.value = "NVC";
      options.aiJobPurpose.value = "FINAL";
      options.clarificationSkipped.value = true;
      const job = await requestExpressionOrganization(
        room.roomId,
        options.workspaceRevision.value,
        composeConversationSource(turns.value, "FINAL"),
        "NVC",
        options.editableExpression.value.fields,
      );
      options.workspaceRevision.value = job.revision;
      options.aiJobId.value = job.jobId;
      options.stage.value = "AI_PENDING";
      void options.pollExpressionJob(job.jobId);
    } catch (error) {
      options.stage.value = "CONVERSATION";
      options.setNotice(
        "error",
        `${options.formatError(error, "这次整理没有开始。 ")}私人对话仍在，没有分享。`,
      );
      options.busy.value = false;
    }
  }

  function returnToConversation() {
    options.stopExpressionJobPolling();
    options.clarificationSkipped.value = false;
    options.aiJobPurpose.value = "CONVERSATION";
    options.stage.value = "CONVERSATION";
    appendAiMessage({
      kind: "ACKNOWLEDGEMENT",
      text: "好，这一版先不确认。你继续讲。",
      supportingText: "刚才的原话都还在，不需要重新填写。",
    });
  }

  function toggleGuidance() {
    if (options.busy.value) return;
    guidancePaused.value = !guidancePaused.value;
    if (guidancePaused.value) {
      appendAiMessage({
        kind: "ACKNOWLEDGEMENT",
        text: "好，我先不问。你继续讲。",
        supportingText: "你发出的每一段仍会留在私人草稿里。",
      });
    } else {
      options.setNotice("info", "之后每一段发送完，我会根据你刚说的内容回应。 ");
    }
  }

  function showPrivacy() {
    uni.showModal({
      title: "现在只有你能看到",
      content: "你说出的原话、录音转写和每一轮 AI 回应都属于私人对话。AI 整理出的文字也只是候选；只有你之后批准的版本，才可能进入共同空间。",
      showCancel: false,
      confirmText: "知道了，继续讲",
      confirmColor: "#315b47",
    });
  }

  async function pauseRoom() {
    if (!options.room.value || options.busy.value || !await options.confirmPause()) return;
    options.busy.value = true;
    options.clearNotice();
    try {
      await ensureRoomReady();
      const room = options.room.value;
      if (!room) throw new Error("当前私人空间已经失效，请返回首页重试。 ");
      await roomApi.pause(room.roomId);
      options.updateRoom({ ...room, phaseV2: "PAUSED" });
      options.stage.value = "PAUSED";
      clearEditorDraft();
      options.draftSaveState.value = "empty";
      options.setNotice("success", "这次沟通已暂停，私人对话没有分享。 ");
    } catch (error) {
      options.setNotice("error", options.formatError(error, "暂时无法暂停，请稍后重试。"));
    } finally {
      options.busy.value = false;
    }
  }

  function reset() {
    turns.value = createPrivateConversation();
    composer.value = "";
    guidancePaused.value = false;
    replying.value = false;
  }

  return {
    turns,
    composer,
    guidancePaused,
    replying,
    transcriptText,
    userTurnCount,
    draftStatus,
    send,
    submitText,
    finish,
    returnToConversation,
    toggleGuidance,
    showPrivacy,
    pauseRoom,
    appendCandidateReply,
    scrollToLatest,
    reset,
  };
}
