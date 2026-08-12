import { ref, type Ref } from "vue";
import type { ClientStage } from "../domain/room-state";
import type { ExpressionMode } from "../domain/expression";
import type { RoomSession } from "../domain/types";
import type { UnderstandingStatus } from "../domain/understanding";
import { requestSharedUnderstanding, roomApi, UnderstandingRequestError } from "../services/api";

type NoticeKind = "success" | "error" | "info";
const maxAutomaticPolls = 40;

export function useSharedUnderstanding(options: {
  room: Ref<RoomSession | null>;
  stage: Ref<ClientStage>;
  busy: Ref<boolean>;
  transcript: Ref<string>;
  selectedMode: Ref<ExpressionMode | null>;
  workspaceRevision: Ref<number>;
  updateRoom(room: RoomSession): void;
  setNotice(kind: NoticeKind, text: string): void;
  clearNotice(): void;
  formatError(error: unknown, fallback: string): string;
  confirmPause(): Promise<boolean>;
}) {
  const status = ref<UnderstandingStatus | null>(null);
  const failure = ref("");
  const retryAllowed = ref(false);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollCount = 0;
  let generation = 0;

  function clearTimer() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function stop() {
    clearTimer();
    generation += 1;
  }

  function reset() {
    stop();
    pollCount = 0;
    status.value = null;
    failure.value = "";
    retryAllowed.value = false;
  }

  async function ensure() {
    const room = options.room.value;
    if (!room || room.workflowVersion !== 2) return;
    stop();
    const activeGeneration = generation;
    failure.value = "";
    retryAllowed.value = false;
    pollCount = 0;
    options.stage.value = "AI_PENDING";
    try {
      await requestSharedUnderstanding(room.roomId);
      if (activeGeneration !== generation) return;
      await pollGeneration(activeGeneration);
    } catch (error) {
      if (activeGeneration === generation) {
        failure.value = options.formatError(error, "共同理解服务暂时不可用，可以稍后重新尝试。");
        retryAllowed.value = !(error instanceof UnderstandingRequestError) || error.retryable;
      }
    }
  }

  async function pollGeneration(activeGeneration: number) {
    const room = options.room.value;
    if (!room || room.workflowVersion !== 2) return;
    clearTimer();
    try {
      const latest = await roomApi.understandingStatus(room.roomId);
      if (activeGeneration !== generation) return;
      status.value = latest;
      if (latest.status === "PAUSED" || latest.phase === "PAUSED") {
        options.updateRoom({ ...room, phaseV2: "PAUSED" });
        options.stage.value = "PAUSED";
        return;
      }
      if (latest.result) {
        failure.value = "";
        retryAllowed.value = false;
        options.updateRoom({ ...room, phaseV2: latest.phase });
        options.stage.value = "COMMON";
        return;
      }
      if (["FAILED_FINAL", "CANCELED", "STALE"].includes(latest.status)) {
        retryAllowed.value = false;
        failure.value = latest.errorCode === "UNDERSTANDING_SAFETY_STOP"
          ? "审查没有允许展示本次候选；系统不会向另一方说明具体风险判断。"
          : "生成或审查没有通过，未经审查的内容不会展示。";
        return;
      }
      pollCount += 1;
      if (pollCount >= maxAutomaticPolls) {
        failure.value = "生成时间超过预期。任务仍然安全保留，你可以稍后重新检查。";
        retryAllowed.value = true;
        return;
      }
      if (pollCount % 8 === 0) {
        try {
          await requestSharedUnderstanding(room.roomId);
        } catch {
          // The durable job remains queryable; explicit retry can repair queue delivery later.
        }
      }
      if (activeGeneration !== generation) return;
      const delayMs = Math.min(6000, 1500 + Math.floor(pollCount / 8) * 1500);
      pollTimer = setTimeout(() => void pollGeneration(activeGeneration), delayMs);
    } catch (error) {
      if (activeGeneration === generation) {
        failure.value = options.formatError(error, "暂时无法读取共同理解进展，可以稍后重试。");
        retryAllowed.value = true;
      }
    }
  }

  async function poll() {
    stop();
    pollCount = 0;
    failure.value = "";
    retryAllowed.value = false;
    await pollGeneration(generation);
  }

  async function decide(decision: "ACCURATE" | "INACCURATE", feedback: string) {
    const room = options.room.value;
    const result = status.value?.result;
    if (!room || !result || options.busy.value) return;
    options.busy.value = true;
    options.clearNotice();
    try {
      const confirmed = await roomApi.confirmUnderstanding(
        room.roomId, result.id, result.contentHash, decision, feedback,
      );
      status.value = {
        ...status.value!, ownDecision: decision,
        accurateCount: confirmed.accurateCount, phase: confirmed.phase,
      };
      options.updateRoom({ ...room, phaseV2: confirmed.phase });
      if (decision === "INACCURATE") {
        options.setNotice("info", "这处问题只保存在你的私人空间。你可以修改自己的表达，或暂停本次沟通。 ");
      } else if (confirmed.bothConfirmed) {
        options.setNotice("success", "双方都确认内容准确。确认准确不代表同意；行动方案将在下一阶段生成。 ");
      } else {
        options.setNotice("success", "已确认准确，正在等待对方独立确认。 ");
      }
    } catch (error) {
      options.setNotice("error", options.formatError(error, "确认没有保存，请刷新后重试。"));
    } finally {
      options.busy.value = false;
    }
  }

  async function editOwnExpression() {
    if (!options.room.value || options.busy.value) return;
    const shouldEdit = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: "修改已经分享的表达？",
        content: "修改后，当前共同理解和双方确认会立即失效。对方可能已经看过旧版本，系统无法让对方忘记。",
        confirmText: "继续修改",
        confirmColor: "#be442e",
        cancelText: "保留当前版本",
        success: ({ confirm }) => resolve(confirm),
        fail: () => resolve(false),
      });
    });
    const room = options.room.value;
    if (!shouldEdit || !room) return;
    options.busy.value = true;
    try {
      const reopened = await roomApi.reopenExpression(room.roomId);
      const workspace = await roomApi.expressionWorkspace(room.roomId);
      reset();
      options.workspaceRevision.value = workspace.revision;
      options.transcript.value = workspace.sourceText;
      options.selectedMode.value = workspace.selectedMode;
      options.updateRoom({ ...room, state: reopened.state, phaseV2: reopened.phase });
      options.stage.value = "CONVERSATION";
      options.setNotice("info", "已回到你的私人对话。旧共同理解已失效。 ");
    } catch (error) {
      options.setNotice("error", options.formatError(error, "暂时无法返回修改，请稍后重试。"));
    } finally {
      options.busy.value = false;
    }
  }

  async function pause() {
    const room = options.room.value;
    if (!room || options.busy.value || !await options.confirmPause()) return;
    options.busy.value = true;
    try {
      await roomApi.pause(room.roomId);
      stop();
      options.updateRoom({ ...room, phaseV2: "PAUSED" });
      options.stage.value = "PAUSED";
      options.setNotice("success", "这次沟通已暂停，系统不会继续生成后续内容。 ");
    } catch (error) {
      options.setNotice("error", options.formatError(error, "暂停没有完成，请稍后重试。"));
    } finally {
      options.busy.value = false;
    }
  }

  return { status, failure, retryAllowed, ensure, poll, decide, editOwnExpression, pause, stop, reset };
}
