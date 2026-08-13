export type DialogueStep = "AWAITING_REFLECTION" | "AWAITING_CONFIRMATION" | "AWAITING_RESPONSE";
export type DialogueTurnKind = "OPENING" | "REFLECTION" | "REFLECTION_CONFIRMATION" | "RESPONSE" | "AI_SUMMARY";

export type DialogueTurn = {
  id: string;
  sequence: number;
  round: number;
  kind: DialogueTurnKind;
  authorRole: "A" | "B" | null;
  replyToTurnId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type DialogueState = {
  phase: "DIALOGUE" | "PAUSED";
  revision: number;
  round: number;
  step: DialogueStep;
  ownRole: "A" | "B";
  activeRole: "A" | "B";
  canAct: boolean;
  focusTurnId: string;
  turns: DialogueTurn[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseDialogueState(value: unknown): DialogueState {
  if (!isRecord(value) || !["DIALOGUE", "PAUSED"].includes(String(value.phase)) ||
    !Number.isSafeInteger(value.revision) || !Number.isSafeInteger(value.round) ||
    !["AWAITING_REFLECTION", "AWAITING_CONFIRMATION", "AWAITING_RESPONSE"].includes(String(value.step)) ||
    !["A", "B"].includes(String(value.ownRole)) || !["A", "B"].includes(String(value.activeRole)) ||
    typeof value.canAct !== "boolean" || typeof value.focusTurnId !== "string" ||
    !Array.isArray(value.turns)) throw new Error("沟通时间线格式无效，请刷新后重试。");
  const turns = value.turns.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !Number.isSafeInteger(item.sequence) ||
      !Number.isSafeInteger(item.round) ||
      !["OPENING", "REFLECTION", "REFLECTION_CONFIRMATION", "RESPONSE", "AI_SUMMARY"].includes(String(item.kind)) ||
      !(item.authorRole === null || item.authorRole === "A" || item.authorRole === "B") ||
      !(item.replyToTurnId === null || typeof item.replyToTurnId === "string") || !isRecord(item.payload) ||
      typeof item.createdAt !== "string") throw new Error("沟通时间线包含无效内容。");
    return item as unknown as DialogueTurn;
  });
  return { ...value, turns } as DialogueState;
}

export function dialogueActionCopy(state: DialogueState) {
  if (!state.canAct) return "正在等待对方完成这一步";
  if (state.step === "AWAITING_REFLECTION") return "先说说你听懂了什么，不急着回应或辩解";
  if (state.step === "AWAITING_CONFIRMATION") return "确认对方是否准确听懂；不准确时指出遗漏即可";
  return "现在可以回应对方，也可以补充自己的感受、需要或请求";
}

export function dialogueTurnText(turn: DialogueTurn) {
  if (turn.kind === "OPENING") {
    const card = isRecord(turn.payload.card) ? turn.payload.card : {};
    return Object.entries(card)
      .filter(([key, item]) => !["mode", "schemaVersion", "uncertainties"].includes(key) && typeof item === "string" && item.trim())
      .map(([, item]) => String(item).trim()).join("\n");
  }
  if (turn.kind === "REFLECTION_CONFIRMATION") {
    return turn.payload.decision === "ACCURATE"
      ? "这准确表达了我的意思。"
      : `还没有完全听懂：${String(turn.payload.feedback ?? "")}`;
  }
  if (turn.kind === "AI_SUMMARY") {
    return [turn.payload.understood, turn.payload.different, turn.payload.nextQuestion]
      .filter(Boolean).map(String).join("\n");
  }
  return typeof turn.payload.text === "string" ? turn.payload.text : "";
}
