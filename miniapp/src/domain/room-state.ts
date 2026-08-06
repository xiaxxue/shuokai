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
  | "INVITE";

export const clientStageOrder: readonly ClientStage[] = [
  "WELCOME",
  "GOAL",
  "RECORD",
  "CLARIFY",
  "REVIEW",
  "INVITE",
];

export function previousStage(stage: ClientStage): ClientStage {
  const index = clientStageOrder.indexOf(stage);
  return clientStageOrder[Math.max(0, index - 1)];
}
