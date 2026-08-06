export type RoomState =
  | "GOAL_SETTING"
  | "A_DRAFTING"
  | "A_REVIEWING"
  | "WAITING_FOR_B"
  | "B_DRAFTING"
  | "B_REVIEWING"
  | "COMMON_VIEW_READY"
  | "AGREEMENT_PENDING"
  | "COMPLETED";

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
  | "CLARIFY"
  | "REVIEW"
  | "INVITE"
  | "COMMON";

export const clientStageOrder: readonly ClientStage[] = [
  "WELCOME",
  "GOAL",
  "RECORD",
  "CLARIFY",
  "REVIEW",
  "INVITE",
  "COMMON",
];

export function previousStage(stage: ClientStage): ClientStage {
  const index = clientStageOrder.indexOf(stage);
  return clientStageOrder[Math.max(0, index - 1)];
}

export function canNavigateBack(stage: ClientStage) {
  return stage === "CLARIFY";
}

export function stageForRoom(role: "A" | "B", state: RoomState): ClientStage {
  if (state === "COMMON_VIEW_READY" || state === "AGREEMENT_PENDING" || state === "COMPLETED") {
    return "COMMON";
  }
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
