import type { RoomState } from "./room-state";

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
};

export type RoomSession = {
  roomId: string;
  code: string;
  role: "A" | "B";
  state: RoomState;
  workflowVersion?: 1 | 2;
  phaseV2?: "SETUP" | "PRIVATE_EXPRESSION" | "UNDERSTANDING_GENERATING" | "UNDERSTANDING_CONFIRMING" |
    "ACTION_GENERATING" | "ACTION_CONFIRMING" | "PAUSED" | "COMPLETED" | "ENDED";
};

export type Perspective = {
  fact: string;
  meaning: string;
  impact: string;
  request: string;
};

export type Agreement = {
  id: string;
  proposal: string;
  review_at: string;
  accepted_a: boolean;
  accepted_b: boolean;
  activated_at: string | null;
  created_at: string;
};

export type RoomSnapshot = {
  room: {
    id: string;
    code: string;
    state: RoomState;
    goal: string | null;
  };
  me: { id: string; role: "A" | "B"; display_name: string };
  participants: Array<{ role: "A" | "B"; display_name: string; joined_at: string }>;
  privateDraft: null | {
    transcript: string;
    clarification: string | null;
  };
  ownPerspective: Perspective | null;
  approvedPerspectives: Array<Perspective & { role: "A" | "B" }>;
  sharedView: null | {
    common_ground: string;
    disagreement: string;
    core_question: string;
  };
  agreement: Agreement | null;
};
