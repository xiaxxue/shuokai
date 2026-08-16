import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  createRelationshipOnboardingSubmitter,
  relationshipOnboardingStage,
} from "../src/services/relationship-onboarding-flow";
import { parseRoomRelationshipContext } from "../src/domain/profile-context";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function relationshipContext(overrides: {
  role?: "A" | "B";
  sharedStatus?: "MISSING" | "DRAFT" | "CONFIRMED" | "SKIPPED";
  mineStatus?: "MISSING" | "DRAFT" | "CONFIRMED" | "DIFFERENT" | "SKIPPED";
  sharedRevision?: number;
  seenSharedRevision?: number | null;
} = {}) {
  const sharedRevision = overrides.sharedRevision ?? 2;
  return parseRoomRelationshipContext({
    role: overrides.role ?? "A",
    shared: {
      status: overrides.sharedStatus ?? "DRAFT",
      revision: sharedRevision,
      consentRevision: 0,
      draftStep: 4,
      relationshipType: "FRIEND",
      relationshipOther: null,
      durationRange: null,
      interactionMode: null,
      useSharedAi: false,
    },
    mine: {
      status: overrides.mineStatus ?? "DRAFT",
      revision: 3,
      consentRevision: 0,
      draftStep: 4,
      draftDecision: null,
      seenSharedRevision: overrides.seenSharedRevision ?? 0,
      relationshipType: null,
      relationshipOther: null,
      durationRange: null,
      interactionMode: null,
      communicationPace: "PAUSE_FIRST",
      responsePreference: null,
      planningStyle: null,
      relationshipState: null,
      observedDifference: "我想保留的输入",
      culturalContext: "",
      useCommunicationAi: true,
      useRelationshipStateAi: true,
      useDifferenceAi: true,
      useCultureAi: false,
      useInviterSharedAi: false,
    },
    recipientResponse: null,
  });
}

describe("relationship onboarding submission flow", () => {
  it("wires the final component action through the page save handler", () => {
    const component = readFileSync(new URL("../src/components/RelationshipOnboarding.vue", import.meta.url), "utf8");
    const page = readFileSync(new URL("../src/pages/index/index.vue", import.meta.url), "utf8");

    expect(component).toContain('@tap="submit"');
    expect(component).toContain('emit("save"');
    expect(page).toContain('@save="saveRelationshipOnboarding"');
  });

  it.each([
    ["A", false, "GOAL"],
    ["B", false, "INVITATION_INTRO"],
    ["B", true, "RECORD"],
  ] as const)("moves role %s to the next stage after one successful save", async (role, invitationAcknowledged, nextStage) => {
    const request = deferred<{ revision: number }>();
    const save = vi.fn(() => request.promise);
    const state = {
      busy: false,
      error: "旧错误",
      stage: role === "A" ? "RELATIONSHIP_SETUP" : "RELATIONSHIP_CONFIRMATION",
      draft: { observedDifference: "我想保留的输入" } as { observedDifference: string } | null,
      context: null as { revision: number } | null,
    };
    const submitter = createRelationshipOnboardingSubmitter<{ revision: number }>({
      setPending: (pending) => { state.busy = pending; },
      clearError: () => { state.error = ""; },
      applySuccess: ({ context, stage }) => {
        state.context = context;
        state.draft = null;
        state.stage = stage;
      },
      applyError: (message) => { state.error = message; },
      focusError: vi.fn(),
    });

    const first = submitter.submit({ role, invitationAcknowledged, save, isCurrent: () => true, recoverError: vi.fn() });
    const duplicate = await submitter.submit({ role, invitationAcknowledged, save, isCurrent: () => true, recoverError: vi.fn() });
    expect(state.busy).toBe(true);
    expect(state.error).toBe("");
    expect(duplicate).toBe("ignored");
    expect(save).toHaveBeenCalledTimes(1);

    request.resolve({ revision: 4 });
    await expect(first).resolves.toBe("saved");
    expect(state).toMatchObject({ busy: false, error: "", stage: nextStage, draft: null, context: { revision: 4 } });
  });

  it("keeps the user on the form with their draft, releases loading, and focuses an actionable error", async () => {
    const calls: string[] = [];
    const state = {
      busy: false,
      error: "",
      stage: "RELATIONSHIP_SETUP",
      draft: { observedDifference: "我想保留的输入" } as { observedDifference: string } | null,
    };
    const focusError = vi.fn(() => { calls.push(`focus:${state.busy}`); });
    const submitter = createRelationshipOnboardingSubmitter<never>({
      setPending: (pending) => { state.busy = pending; calls.push(`busy:${pending}`); },
      clearError: () => { state.error = ""; },
      applySuccess: vi.fn(),
      applyError: (message) => { state.error = message; calls.push("error"); },
      focusError,
    });

    const result = await submitter.submit({
      role: "A",
      invitationAcknowledged: false,
      save: async () => { throw new Error("internal rpc signature mismatch"); },
      isCurrent: () => true,
      recoverError: async () => "关系背景没有保存。请重新保存；如果仍然失败，请检查网络连接。刚才的输入仍保留。",
    });

    expect(result).toBe("failed");
    expect(state).toEqual({
      busy: false,
      error: "关系背景没有保存。请重新保存；如果仍然失败，请检查网络连接。刚才的输入仍保留。",
      stage: "RELATIONSHIP_SETUP",
      draft: { observedDifference: "我想保留的输入" },
    });
    expect(focusError).toHaveBeenCalledTimes(1);
    expect(calls.slice(-3)).toEqual(["error", "busy:false", "focus:false"]);
  });

  it("ignores a late response after the active room changes and accepts the next submission", async () => {
    const request = deferred<{ revision: number }>();
    let current = true;
    const applySuccess = vi.fn();
    const applyError = vi.fn();
    const submitter = createRelationshipOnboardingSubmitter<{ revision: number }>({
      setPending: vi.fn(),
      clearError: vi.fn(),
      applySuccess,
      applyError,
      focusError: vi.fn(),
    });

    const pending = submitter.submit({
      role: "A",
      invitationAcknowledged: false,
      save: () => request.promise,
      isCurrent: () => current,
      recoverError: async () => "不应显示",
    });
    current = false;
    request.resolve({ revision: 4 });

    await expect(pending).resolves.toBe("stale");
    expect(applySuccess).not.toHaveBeenCalled();
    expect(applyError).not.toHaveBeenCalled();
    await expect(submitter.submit({
      role: "A",
      invitationAcknowledged: false,
      save: async () => ({ revision: 5 }),
      isCurrent: () => true,
      recoverError: async () => "不应显示",
    })).resolves.toBe("saved");
    expect(applySuccess).toHaveBeenCalledTimes(1);
  });
});

describe("relationship onboarding restoration routing", () => {
  it("resumes incomplete role A context and advances completed role A context", () => {
    expect(relationshipOnboardingStage(
      { workflowVersion: 2, role: "A", state: "GOAL_SETTING" },
      relationshipContext({ sharedStatus: "DRAFT" }),
      false,
    )).toBe("RELATIONSHIP_SETUP");
    expect(relationshipOnboardingStage(
      { workflowVersion: 2, role: "A", state: "GOAL_SETTING" },
      relationshipContext({ sharedStatus: "CONFIRMED" }),
      false,
    )).toBe("GOAL");
  });

  it("only advances role B after responding to the latest shared revision", () => {
    const room = { workflowVersion: 2, role: "B", state: "B_DRAFTING" } as const;
    expect(relationshipOnboardingStage(room, relationshipContext({
      role: "B", mineStatus: "CONFIRMED", sharedRevision: 3, seenSharedRevision: 2,
    }), false)).toBe("RELATIONSHIP_CONFIRMATION");
    expect(relationshipOnboardingStage(room, relationshipContext({
      role: "B", mineStatus: "CONFIRMED", sharedRevision: 3, seenSharedRevision: 3,
    }), false)).toBe("INVITATION_INTRO");
    expect(relationshipOnboardingStage(room, relationshipContext({
      role: "B", mineStatus: "CONFIRMED", sharedRevision: 3, seenSharedRevision: 3,
    }), true)).toBe("RECORD");
  });
});
