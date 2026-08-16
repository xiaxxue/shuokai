import type { RoomRelationshipContext } from "../domain/profile-context";
import type { ClientStage } from "../domain/room-state";
import type { RoomSession } from "../domain/types";

export type RelationshipOnboardingSubmitOutcome = "saved" | "failed" | "ignored" | "stale";

type RelationshipOnboardingSuccess<TContext> = {
  context: TContext;
  role: RoomSession["role"];
  stage: "GOAL" | "INVITATION_INTRO" | "RECORD";
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
  invitationAcknowledged: boolean;
  save: () => Promise<TContext>;
  isCurrent: () => boolean;
  recoverError: (error: unknown) => Promise<string>;
};

function stageAfterRelationshipOnboarding(
  role: RoomSession["role"],
  invitationAcknowledged: boolean,
): "GOAL" | "INVITATION_INTRO" | "RECORD" {
  if (role === "A") return "GOAL";
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
          stage: stageAfterRelationshipOnboarding(submission.role, submission.invitationAcknowledged),
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
  if (room.role === "A" && room.state === "GOAL_SETTING") {
    return context.shared.status === "CONFIRMED" || context.shared.status === "SKIPPED"
      ? "GOAL"
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
