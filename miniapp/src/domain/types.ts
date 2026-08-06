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
};

export type Perspective = {
  fact: string;
  meaning: string;
  impact: string;
  request: string;
};

export type RoomSnapshot = {
  room: {
    id: string;
    code: string;
    state: RoomState;
    goal: string | null;
  };
  me: { id: string; role: "A" | "B"; display_name: string };
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
};
