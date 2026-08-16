import {
  optionLabel,
  relationshipTypeOptions,
  type RoomRelationshipContext,
} from "../domain/profile-context";
import type { ClientStage } from "../domain/room-state";
import type { RoomSession } from "../domain/types";

export type RelationshipOnboardingSubmitOutcome = "saved" | "failed" | "ignored" | "stale";

export type InviteRelationshipSummary = {
  ready: boolean;
  state: string;
  title: string;
  note: string;
};

export function summarizeInviteRelationship(
  context: RoomRelationshipContext | null,
): InviteRelationshipSummary {
  const shared = context?.shared;
  if (!shared || shared.status === "MISSING" || shared.status === "DRAFT") return {
    ready: false,
    state: "尚未保存",
    title: "先说明你准备邀请谁",
    note: "补充关系说明，或明确选择暂不说明后，再分享邀请链接。",
  };
  if (shared.status === "SKIPPED") return {
    ready: true,
    state: "已选择暂不说明",
    title: "这次暂不说明关系",
    note: "对方仍可以填写自己的版本，也可以暂不回答。",
  };
  return {
    ready: true,
    state: "你的版本",
    title: shared.relationshipType === "OTHER"
      ? shared.relationshipOther || "其他关系"
      : optionLabel(relationshipTypeOptions, shared.relationshipType),
    note: "对方会看到这是你的理解，并可以确认、填写自己的版本或暂不回答。",
  };
}

type RelationshipOnboardingSuccess<TContext> = {
  context: TContext;
  role: RoomSession["role"];
  stage: "GOAL" | "INVITE" | "INVITATION_INTRO" | "RECORD";
};

type RelationshipOnboardingSubmitterOptions<TContext> = {
  setPending: (pending: boolean) => void;
  clearError: () => void;
  applySuccess: (success: RelationshipOnboardingSuccess<TContext>) => void;
  applyError: (message: string) => void;
  focusError: () => void | Promise<void>;
};

type RelationshipOnboardingSubmission<TContext> = {
  role: RoomSession["role"];
  roomState: RoomSession["state"];
  invitationAcknowledged: boolean;
  save: () => Promise<TContext>;
  isCurrent: () => boolean;
  recoverError: (error: unknown) => Promise<string>;
};

function stageAfterRelationshipOnboarding(
  role: RoomSession["role"],
  roomState: RoomSession["state"],
  invitationAcknowledged: boolean,
): "GOAL" | "INVITE" | "INVITATION_INTRO" | "RECORD" {
  if (role === "A") return roomState === "GOAL_SETTING" ? "GOAL" : "INVITE";
  return invitationAcknowledged ? "RECORD" : "INVITATION_INTRO";
}

export function createRelationshipOnboardingSubmitter<TContext>(
  options: RelationshipOnboardingSubmitterOptions<TContext>,
) {
  let pending = false;

  return {
    async submit(submission: RelationshipOnboardingSubmission<TContext>): Promise<RelationshipOnboardingSubmitOutcome> {
      if (pending) return "ignored";
      pending = true;
      let focusFailure = false;
      options.clearError();
      options.setPending(true);

      try {
        let context: TContext;
        try {
          context = await submission.save();
        } catch (error) {
          if (!submission.isCurrent()) return "stale";
          const message = await submission.recoverError(error);
          if (!submission.isCurrent()) return "stale";
          options.applyError(message);
          focusFailure = true;
          return "failed";
        }

        if (!submission.isCurrent()) return "stale";
        options.applySuccess({
          context,
          role: submission.role,
          stage: stageAfterRelationshipOnboarding(
            submission.role,
            submission.roomState,
            submission.invitationAcknowledged,
          ),
        });
        return "saved";
      } finally {
        pending = false;
        options.setPending(false);
        if (focusFailure) await options.focusError();
      }
    },
  };
}

export function relationshipOnboardingStage(
  room: Pick<RoomSession, "workflowVersion" | "role" | "state">,
  context: RoomRelationshipContext,
  invitationAcknowledged: boolean,
): ClientStage | null {
  if (room.workflowVersion !== 2) return null;
  if (room.role === "A" && (room.state === "GOAL_SETTING" || room.state === "WAITING_FOR_B")) {
    const nextStage = room.state === "GOAL_SETTING" ? "GOAL" : "INVITE";
    return context.shared.status === "CONFIRMED" || context.shared.status === "SKIPPED"
      ? nextStage
      : "RELATIONSHIP_SETUP";
  }
  if (room.role === "B" && (room.state === "B_DRAFTING" || room.state === "B_REVIEWING")) {
    const completedLatestRevision = (
      context.mine.status === "CONFIRMED" ||
      context.mine.status === "DIFFERENT" ||
      context.mine.status === "SKIPPED"
    ) && context.mine.seenSharedRevision === context.shared.revision;
    if (!completedLatestRevision) return "RELATIONSHIP_CONFIRMATION";
    return invitationAcknowledged ? "RECORD" : "INVITATION_INTRO";
  }
  return null;
}
