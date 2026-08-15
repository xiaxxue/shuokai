import { ref, type Ref } from "vue";
import type {
  ClarificationTurn,
  DiscoveryUnderstandingState,
} from "../domain/clarification";
import type { ExpressionMode, SafetyDisposition } from "../domain/expression";
import type { ClientStage } from "../domain/room-state";
import type { RoomSession } from "../domain/types";
import { requestExpressionClarification } from "../services/api";
import type {
  AiPrivateConversation,
  DetachedDiscoveryDraft,
  PersonalMemoryItem,
} from "../domain/ai-memory";

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
  const understanding = ref<DiscoveryUnderstandingState | null>(null);
  const safetyDisposition = ref<SafetyDisposition>("ALLOW");
  const safetyMessage = ref("");
  const thinking = ref(false);
  const conversationRevision = ref(0);
  const memoryProposals = ref<PersonalMemoryItem[]>([]);
  const restored = ref(false);
  const saveState = ref<"idle" | "local" | "saving" | "saved" | "error">("idle");
  const detachedDrafts = ref<DetachedDiscoveryDraft[]>([]);

  function reset() {
    started.value = false;
    question.value = "";
    ready.value = false;
    understanding.value = null;
    safetyDisposition.value = "ALLOW";
    safetyMessage.value = "";
    thinking.value = false;
    conversationRevision.value = 0;
    memoryProposals.value = [];
    restored.value = false;
    saveState.value = "idle";
    detachedDrafts.value = [];
  }

  function restore(conversation: AiPrivateConversation) {
    const previousRevision = conversationRevision.value;
    if (conversation.revision > previousRevision && options.answer.value.trim()) {
      detachedDrafts.value = [...detachedDrafts.value, {
        answer: options.answer.value,
        question: question.value,
        revision: previousRevision,
      }];
      options.answer.value = "";
    }
    conversationRevision.value = conversation.revision;
    memoryProposals.value = conversation.memoryProposals;
    if (conversation.revision === 0 || !conversation.sourceText.trim()) return false;
    options.transcript.value = conversation.sourceText;
    options.turns.value = conversation.turns;
    started.value = true;
    question.value = conversation.question;
    ready.value = conversation.ready;
    understanding.value = conversation.understanding;
    safetyDisposition.value = conversation.safetyDisposition;
    safetyMessage.value = conversation.safetyMessage;
    restored.value = true;
    saveState.value = "saved";
    return true;
  }

  function markLocalDraft() {
    if (!options.busy.value) saveState.value = "local";
  }

  function reapplyDetachedDraft(index: number) {
    const draft = detachedDrafts.value[index];
    if (!draft) return;
    if (options.answer.value.trim()) {
      options.setNotice("info", "输入框里已有内容。请先发送或清空，再放回这段旧草稿。 ");
      return;
    }
    options.answer.value = draft.answer;
    detachedDrafts.value = detachedDrafts.value.filter((_, itemIndex) => itemIndex !== index);
    markLocalDraft();
  }

  function discardDetachedDraft(index: number) {
    detachedDrafts.value = detachedDrafts.value.filter((_, itemIndex) => itemIndex !== index);
  }

  function appendTranscription(target: "transcript" | "answer", text: string) {
    const value = text.trim();
    if (!value) return;
    const field = target === "answer" ? options.answer : options.transcript;
    field.value = field.value.trim() ? `${field.value.trim()}\n${value}` : value;
    saveState.value = "local";
  }

  async function send() {
    if (!options.room.value || options.busy.value || options.recording.value) return;
    const isInitialMessage = !started.value;
    const sourceText = options.transcript.value.trim();
    if (!sourceText) return;
    const currentQuestion = question.value.trim();
    const currentAnswer = options.answer.value.trim();
    const safetyStopped = ["BLOCK_SHARE", "PAUSE"].includes(safetyDisposition.value);
    if (!isInitialMessage && (
      !currentQuestion || !currentAnswer || ready.value || safetyStopped
    )) return;

    options.clearNotice();
    options.busy.value = true;
    thinking.value = true;
    saveState.value = "saving";
    const nextTurns = isInitialMessage
      ? options.turns.value
      : [...options.turns.value, { question: currentQuestion, answer: currentAnswer }];
    try {
      const result = await requestExpressionClarification(
        options.room.value.roomId,
        conversationRevision.value,
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
      understanding.value = result.understanding;
      safetyDisposition.value = result.safetyDisposition;
      safetyMessage.value = result.safetyMessage;
      if (Number.isSafeInteger(result.revision) && result.revision >= 0) {
        conversationRevision.value = result.revision;
      }
      memoryProposals.value = Array.isArray(result.memoryProposals) ? result.memoryProposals : [];
      restored.value = false;
      saveState.value = "saved";
    } catch (error) {
      saveState.value = "error";
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
    if (["BLOCK_SHARE", "PAUSE"].includes(safetyDisposition.value)) return;
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
    started, question, ready, understanding,
    safetyDisposition, safetyMessage, thinking, reset, send, finish,
    conversationRevision, memoryProposals, restored, saveState, restore,
    detachedDrafts,
    markLocalDraft, reapplyDetachedDraft, discardDetachedDraft, appendTranscription,
  };
}
