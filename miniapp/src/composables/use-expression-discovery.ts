import { ref, type Ref } from "vue";
import type { ClarificationTurn } from "../domain/clarification";
import type { ExpressionMode, SafetyDisposition } from "../domain/expression";
import type { ClientStage } from "../domain/room-state";
import type { RoomSession } from "../domain/types";
import { requestExpressionClarification } from "../services/api";

type NoticeKind = "info" | "success" | "error";

type DiscoveryOptions = {
  room: Ref<RoomSession | null>;
  stage: Ref<ClientStage>;
  busy: Ref<boolean>;
  recording: Ref<boolean>;
  transcript: Ref<string>;
  selectedMode: Ref<ExpressionMode | null>;
  turns: Ref<ClarificationTurn[]>;
  answer: Ref<string>;
  setNotice(kind: NoticeKind, message: string): void;
  clearNotice(): void;
  formatError(error: unknown, fallback: string): string;
};

export function useExpressionDiscovery(options: DiscoveryOptions) {
  const started = ref(false);
  const question = ref("");
  const ready = ref(false);
  const safetyDisposition = ref<SafetyDisposition>("ALLOW");
  const safetyMessage = ref("");
  const thinking = ref(false);

  function reset() {
    started.value = false;
    question.value = "";
    ready.value = false;
    safetyDisposition.value = "ALLOW";
    safetyMessage.value = "";
    thinking.value = false;
  }

  async function send() {
    if (!options.room.value || options.busy.value || options.recording.value) return;
    const isInitialMessage = !started.value;
    const sourceText = options.transcript.value.trim();
    if (!sourceText) return;
    const currentQuestion = question.value.trim();
    const currentAnswer = options.answer.value.trim();
    if (!isInitialMessage && (!currentQuestion || !currentAnswer || ready.value)) return;

    options.clearNotice();
    options.busy.value = true;
    thinking.value = true;
    const nextTurns = isInitialMessage
      ? options.turns.value
      : [...options.turns.value, { question: currentQuestion, answer: currentAnswer }];
    try {
      const result = await requestExpressionClarification(
        options.room.value.roomId,
        sourceText,
        nextTurns,
      );
      started.value = true;
      if (!isInitialMessage) {
        options.turns.value = nextTurns;
        options.answer.value = "";
      }
      question.value = result.question;
      ready.value = result.ready;
      safetyDisposition.value = result.safetyDisposition;
      safetyMessage.value = result.safetyMessage;
    } catch (error) {
      options.setNotice(
        "error",
        options.formatError(error, "AI 暂时没有接住这句话，请稍后再试。"),
      );
    } finally {
      thinking.value = false;
      options.busy.value = false;
    }
  }

  function finish() {
    if (!started.value || options.busy.value || options.recording.value) return;
    if (options.answer.value.trim()) {
      options.setNotice("info", "这句话还没有发给 AI。请先发送，或清空后再选择表达路径。 ");
      return;
    }
    options.selectedMode.value = null;
    options.stage.value = "MODE_SELECT";
    options.setNotice("info", "现在选择表达路径。AI 会用刚才的完整对话整理卡片。 ");
  }

  return { started, question, ready, safetyDisposition, safetyMessage, thinking, reset, send, finish };
}
