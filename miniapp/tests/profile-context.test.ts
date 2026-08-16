import { describe, expect, it } from "vitest";
import {
  normalizeDisplayName,
  parseRoomRelationshipContext,
  parseUserProfile,
  shouldOfferNameOnlySave,
  toParticipantContextDraft,
  toSharedContextDraft,
} from "../src/domain/profile-context";
import { rebaseRelationshipDraft } from "../src/services/profile-context-session";

describe("profile and relationship context parsing", () => {
  it("normalizes a display name without requiring a real identity", () => {
    expect(normalizeDisplayName("  小　雨  ")).toBe("小 雨");
  });

  it("accepts a missing profile and rejects unknown preference values", () => {
    expect(shouldOfferNameOnlySave("MISSING")).toBe(true);
    expect(shouldOfferNameOnlySave("ACTIVE")).toBe(false);
    expect(parseUserProfile({ status: "MISSING", revision: 0, consentRevision: 0 })).toMatchObject({
      status: "MISSING", displayName: "", revision: 0,
    });
    expect(() => parseUserProfile({
      status: "ACTIVE", displayName: "小雨", responseLength: "VERY_LONG",
      revision: 1, consentRevision: 1,
    })).toThrow("无效数据");
  });

  it("keeps inviter and receiver versions separate", () => {
    const parsed = parseRoomRelationshipContext({
      role: "B",
      shared: {
        status: "CONFIRMED", revision: 2, consentRevision: 1,
        relationshipType: "PARTNER", relationshipOther: null,
        durationRange: "Y1_3", interactionMode: "MOSTLY_REMOTE", useSharedAi: true,
      },
      mine: {
        status: "DIFFERENT", revision: 3, consentRevision: 2, seenSharedRevision: 2,
        relationshipType: "FRIEND", relationshipOther: null,
        durationRange: "Y3_7", interactionMode: "MIXED",
        communicationPace: "PAUSE_FIRST", responsePreference: "EMPATHY_FIRST",
        planningStyle: "DEPENDS", relationshipState: "BOUNDARY",
        observedDifference: "我需要先安静", culturalContext: "",
        useCommunicationAi: true, useRelationshipStateAi: true,
        useDifferenceAi: true, useCultureAi: false, useInviterSharedAi: false,
      },
      recipientResponse: null,
    });
    expect(parsed.shared.relationshipType).toBe("PARTNER");
    expect(parsed.mine.relationshipType).toBe("FRIEND");
    expect(parsed.mine.useInviterSharedAi).toBe(false);

    const rebased = rebaseRelationshipDraft({
      step: 3,
      decision: "DIFFERENT",
      shared: { relationshipType: "FRIEND", relationshipOther: null, durationRange: null, interactionMode: null, useSharedAi: false },
      mine: {
        relationshipType: null, relationshipOther: null, durationRange: null, interactionMode: null,
        communicationPace: "PAUSE_FIRST", responsePreference: null, planningStyle: null,
        relationshipState: null, observedDifference: "本机未提交内容", culturalContext: "",
        useCommunicationAi: true, useRelationshipStateAi: true, useDifferenceAi: true,
        useCultureAi: false, useInviterSharedAi: false,
      },
      sharedRevision: 1,
      privateRevision: 1,
    }, parsed);
    expect(rebased.sharedRevision).toBe(2);
    expect(rebased.privateRevision).toBe(3);
    expect(rebased.mine.observedDifference).toBe("本机未提交内容");
  });

  it("projects restored server context to the exact editable RPC payload", () => {
    const parsed = parseRoomRelationshipContext({
      role: "A",
      shared: {
        status: "DRAFT", draftStep: 2, revision: 1, consentRevision: 0,
        relationshipType: "PARTNER", relationshipOther: null,
        durationRange: "Y1_3", interactionMode: "MIXED", useSharedAi: true,
        updatedAt: "2026-08-16T07:47:00.000Z",
      },
      mine: {
        status: "DRAFT", draftStep: 2, draftDecision: null,
        seenSharedRevision: 1, revision: 1, consentRevision: 0,
        relationshipType: null, relationshipOther: null, durationRange: null, interactionMode: null,
        communicationPace: "IMMEDIATE", responsePreference: "EMPATHY_FIRST",
        planningStyle: "PLAN_AHEAD", relationshipState: null,
        observedDifference: "", culturalContext: "",
        useCommunicationAi: true, useRelationshipStateAi: true,
        useDifferenceAi: true, useCultureAi: false, useInviterSharedAi: false,
        updatedAt: "2026-08-16T07:47:00.000Z",
      },
      recipientResponse: null,
    });

    expect(toSharedContextDraft(parsed.shared)).toEqual({
      relationshipType: "PARTNER",
      relationshipOther: null,
      durationRange: "Y1_3",
      interactionMode: "MIXED",
      useSharedAi: true,
    });
    expect(toParticipantContextDraft(parsed.mine)).toEqual({
      relationshipType: null,
      relationshipOther: null,
      durationRange: null,
      interactionMode: null,
      communicationPace: "IMMEDIATE",
      responsePreference: "EMPATHY_FIRST",
      planningStyle: "PLAN_AHEAD",
      relationshipState: null,
      observedDifference: "",
      culturalContext: "",
      useCommunicationAi: true,
      useRelationshipStateAi: true,
      useDifferenceAi: true,
      useCultureAi: false,
      useInviterSharedAi: false,
    });
  });
});
