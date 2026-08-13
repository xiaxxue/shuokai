export const roomStates = [
  "GOAL_SETTING",
  "A_DRAFTING",
  "A_REVIEWING",
  "WAITING_FOR_B",
  "B_DRAFTING",
  "B_REVIEWING",
  "COMMON_VIEW_READY",
  "AGREEMENT_PENDING",
  "COMPLETED",
] as const;

export type RoomState = typeof roomStates[number];

export const allowedTransitions: Record<RoomState, readonly RoomState[]> = {
  GOAL_SETTING: ["A_DRAFTING"],
  A_DRAFTING: ["A_REVIEWING"],
  A_REVIEWING: ["WAITING_FOR_B"],
  WAITING_FOR_B: ["B_DRAFTING", "COMMON_VIEW_READY"],
  B_DRAFTING: ["B_REVIEWING"],
  B_REVIEWING: ["COMMON_VIEW_READY"],
  COMMON_VIEW_READY: ["AGREEMENT_PENDING"],
  AGREEMENT_PENDING: ["COMPLETED"],
  COMPLETED: [],
};

export function canTransition(from: RoomState, to: RoomState) {
  return allowedTransitions[from].includes(to);
}

export type ClientStage =
  | "WELCOME"
  | "GOAL"
  | "RECORD"
  | "MODE_SELECT"
  | "AI_PENDING"
  | "CLARIFICATION_CHAT"
  | "EXPRESSION_REVIEW"
  | "PAUSED"
  | "NVC_OBSERVATION"
  | "NVC_FEELING"
  | "NVC_NEED"
  | "NVC_REQUEST"
  | "REVIEW"
  | "INVITE"
  | "COMMON"
  | "AGREEMENT"
  | "COMPLETE";

export const clientStageOrder: readonly ClientStage[] = [
  "WELCOME",
  "GOAL",
  "RECORD",
  "MODE_SELECT",
  "AI_PENDING",
  "CLARIFICATION_CHAT",
  "EXPRESSION_REVIEW",
  "PAUSED",
  "NVC_OBSERVATION",
  "NVC_FEELING",
  "NVC_NEED",
  "NVC_REQUEST",
  "REVIEW",
  "INVITE",
  "COMMON",
  "AGREEMENT",
  "COMPLETE",
];

export function previousStage(stage: ClientStage): ClientStage {
  if (stage === "MODE_SELECT") return "RECORD";
  if (
    stage === "AI_PENDING" ||
    stage === "CLARIFICATION_CHAT" ||
    stage === "EXPRESSION_REVIEW" ||
    stage === "PAUSED"
  ) return "MODE_SELECT";
  if (stage === "NVC_OBSERVATION") return "RECORD";
  const index = clientStageOrder.indexOf(stage);
  return clientStageOrder[Math.max(0, index - 1)];
}

export function canNavigateBack(stage: ClientStage) {
  return [
    "NVC_OBSERVATION",
    "NVC_FEELING",
    "NVC_NEED",
    "NVC_REQUEST",
    "REVIEW",
    "MODE_SELECT",
    "CLARIFICATION_CHAT",
    "EXPRESSION_REVIEW",
  ].includes(stage);
}

export const editorClientStages: readonly ClientStage[] = [
  "RECORD",
  "MODE_SELECT",
  "AI_PENDING",
  "CLARIFICATION_CHAT",
  "EXPRESSION_REVIEW",
  "NVC_OBSERVATION",
  "NVC_FEELING",
  "NVC_NEED",
  "NVC_REQUEST",
  "REVIEW",
];

export function isEditorClientStage(stage: unknown): stage is ClientStage {
  return typeof stage === "string" && editorClientStages.includes(stage as ClientStage);
}

export function stageForRoom(role: "A" | "B", state: RoomState): ClientStage {
  if (state === "COMPLETED") return "COMPLETE";
  if (state === "AGREEMENT_PENDING") return "AGREEMENT";
  if (state === "COMMON_VIEW_READY") return "COMMON";
  if (role === "A") {
    if (state === "GOAL_SETTING") return "GOAL";
    if (state === "A_DRAFTING") return "RECORD";
    if (state === "A_REVIEWING") return "REVIEW";
    return "INVITE";
  }
  if (state === "B_DRAFTING") return "RECORD";
  if (state === "B_REVIEWING") return "REVIEW";
  return "WELCOME";
}
