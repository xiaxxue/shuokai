import { ref, type Ref } from "vue";
import type {
  ClarificationTurn,
  DiscoveryUnderstandingState,
} from "../domain/clarification";
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
  const followUpLimitReached = ref(false);
  const understanding = ref<DiscoveryUnderstandingState | null>(null);
  const safetyDisposition = ref<SafetyDisposition>("ALLOW");
  const safetyMessage = ref("");
  const thinking = ref(false);

  function reset() {
    started.value = false;
    question.value = "";
    ready.value = false;
    followUpLimitReached.value = false;
    understanding.value = null;
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
    if (!isInitialMessage && (
      !currentQuestion || !currentAnswer || ready.value || followUpLimitReached.value
    )) return;

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
      followUpLimitReached.value = result.followUpLimitReached;
      understanding.value = result.understanding;
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
    options.setNotice(
      "info",
      ready.value
        ? "这些背景已经足够开始整理。现在选择表达路径。 "
        : "你选择先停止追问。AI 会按目前提供的内容整理，之后仍可修改。 ",
    );
  }

  return {
    started, question, ready, followUpLimitReached, understanding,
    safetyDisposition, safetyMessage, thinking, reset, send, finish,
  };
}
