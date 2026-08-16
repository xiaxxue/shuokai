export const responseLengthOptions = [
  { value: "SHORT", label: "简短" },
  { value: "BALANCED", label: "适中" },
  { value: "DETAILED", label: "详细" },
] as const;

export const relationshipTypeOptions = [
  { value: "PARTNER", label: "恋人 / 伴侣" },
  { value: "MARRIED", label: "夫妻" },
  { value: "FAMILY", label: "家人" },
  { value: "FRIEND", label: "朋友" },
  { value: "COLLEAGUE", label: "同事 / 合作伙伴" },
  { value: "OTHER", label: "其他" },
] as const;

export const durationOptions = [
  { value: "LT_3M", label: "不到 3 个月" },
  { value: "M3_12", label: "3–12 个月" },
  { value: "Y1_3", label: "1–3 年" },
  { value: "Y3_7", label: "3–7 年" },
  { value: "Y7_PLUS", label: "7 年以上" },
  { value: "NA", label: "不适用 / 不确定" },
] as const;

export const interactionOptions = [
  { value: "MOSTLY_IN_PERSON", label: "主要线下见面" },
  { value: "MOSTLY_REMOTE", label: "主要异地 / 线上" },
  { value: "MIXED", label: "两者都有" },
  { value: "RECENTLY_CHANGED", label: "最近发生了变化" },
  { value: "NA", label: "不适用 / 不确定" },
] as const;

export const communicationPaceOptions = [
  { value: "IMMEDIATE", label: "希望尽快说清" },
  { value: "PAUSE_FIRST", label: "通常需要先缓一缓" },
  { value: "DEPENDS", label: "要看具体情况" },
] as const;

export const responsePreferenceOptions = [
  { value: "EMPATHY_FIRST", label: "先理解感受" },
  { value: "SOLUTIONS_FIRST", label: "先讨论解决办法" },
  { value: "BOTH", label: "两者都需要" },
] as const;

export const planningStyleOptions = [
  { value: "PLAN_AHEAD", label: "先约定清楚再行动" },
  { value: "ADAPTIVE", label: "边行动边调整" },
  { value: "DEPENDS", label: "要看具体事情" },
] as const;

export const relationshipStateOptions = [
  { value: "REPAIR", label: "想修复一次误解" },
  { value: "REPEATING", label: "在反复争论同一件事" },
  { value: "DECISION", label: "需要共同做一个决定" },
  { value: "BOUNDARY", label: "想重新说明边界" },
  { value: "UNCERTAIN", label: "不确定关系接下来怎样" },
  { value: "PAUSE_END", label: "想暂停或结束" },
] as const;

type OptionValue<T extends readonly { value: string }[]> = T[number]["value"];
export type ResponseLength = OptionValue<typeof responseLengthOptions>;
export type RelationshipType = OptionValue<typeof relationshipTypeOptions>;
export type DurationRange = OptionValue<typeof durationOptions>;
export type InteractionMode = OptionValue<typeof interactionOptions>;
export type CommunicationPace = OptionValue<typeof communicationPaceOptions>;
export type ResponsePreference = OptionValue<typeof responsePreferenceOptions>;
export type PlanningStyle = OptionValue<typeof planningStyleOptions>;
export type RelationshipState = OptionValue<typeof relationshipStateOptions>;

export type UserProfile = {
  status: "MISSING" | "ACTIVE";
  displayName: string;
  responseLength: ResponseLength | null;
  language: string | null;
  useResponseLengthAi: boolean;
  useLanguageAi: boolean;
  revision: number;
  consentRevision: number;
  updatedAt: string | null;
};

export type SharedRelationshipContext = {
  status: "MISSING" | "DRAFT" | "CONFIRMED" | "SKIPPED";
  draftStep: number;
  relationshipType: RelationshipType | null;
  relationshipOther: string | null;
  durationRange: DurationRange | null;
  interactionMode: InteractionMode | null;
  useSharedAi: boolean;
  revision: number;
  consentRevision: number;
  updatedAt: string | null;
};

export type ParticipantRelationshipContext = {
  status: "MISSING" | "DRAFT" | "CONFIRMED" | "DIFFERENT" | "SKIPPED";
  draftStep: number;
  draftDecision: "CONFIRMED" | "DIFFERENT" | "SKIPPED" | null;
  seenSharedRevision: number;
  relationshipType: RelationshipType | null;
  relationshipOther: string | null;
  durationRange: DurationRange | null;
  interactionMode: InteractionMode | null;
  communicationPace: CommunicationPace | null;
  responsePreference: ResponsePreference | null;
  planningStyle: PlanningStyle | null;
  relationshipState: RelationshipState | null;
  observedDifference: string;
  culturalContext: string;
  useCommunicationAi: boolean;
  useRelationshipStateAi: boolean;
  useDifferenceAi: boolean;
  useCultureAi: boolean;
  useInviterSharedAi: boolean;
  revision: number;
  consentRevision: number;
  updatedAt: string | null;
};

export type RecipientRelationshipResponse = {
  status: "CONFIRMED" | "DIFFERENT" | "SKIPPED" | "PENDING";
  seenSharedRevision: number;
  relationshipType: RelationshipType | null;
  relationshipOther: string | null;
  durationRange: DurationRange | null;
  interactionMode: InteractionMode | null;
} | null;

export type RoomRelationshipContext = {
  role: "A" | "B";
  shared: SharedRelationshipContext;
  mine: ParticipantRelationshipContext;
  recipientResponse: RecipientRelationshipResponse;
};

export type ProfileDraft = Pick<UserProfile,
  "displayName" | "responseLength" | "language" | "useResponseLengthAi" | "useLanguageAi">;

export type SharedContextDraft = Pick<SharedRelationshipContext,
  "relationshipType" | "relationshipOther" | "durationRange" | "interactionMode" | "useSharedAi">;

export type ParticipantContextDraft = Pick<ParticipantRelationshipContext,
  "relationshipType" | "relationshipOther" | "durationRange" | "interactionMode" |
  "communicationPace" | "responsePreference" | "planningStyle" | "relationshipState" |
  "observedDifference" | "culturalContext" | "useCommunicationAi" |
  "useRelationshipStateAi" | "useDifferenceAi" | "useCultureAi" | "useInviterSharedAi">;

export const emptyProfileDraft = (): ProfileDraft => ({
  displayName: "",
  responseLength: null,
  language: null,
  useResponseLengthAi: true,
  useLanguageAi: true,
});

export const emptySharedContextDraft = (): SharedContextDraft => ({
  relationshipType: null,
  relationshipOther: null,
  durationRange: null,
  interactionMode: null,
  useSharedAi: true,
});

export const emptyParticipantContextDraft = (): ParticipantContextDraft => ({
  relationshipType: null,
  relationshipOther: null,
  durationRange: null,
  interactionMode: null,
  communicationPace: null,
  responsePreference: null,
  planningStyle: null,
  relationshipState: null,
  observedDifference: "",
  culturalContext: "",
  useCommunicationAi: true,
  useRelationshipStateAi: true,
  useDifferenceAi: true,
  useCultureAi: false,
  useInviterSharedAi: false,
});

export function toSharedContextDraft(value: Omit<SharedContextDraft, "useSharedAi"> & { useSharedAi?: boolean }): SharedContextDraft {
  return {
    relationshipType: value.relationshipType,
    relationshipOther: value.relationshipOther,
    durationRange: value.durationRange,
    interactionMode: value.interactionMode,
    useSharedAi: value.useSharedAi ?? true,
  };
}

export function toParticipantContextDraft(value: ParticipantContextDraft): ParticipantContextDraft {
  return {
    relationshipType: value.relationshipType,
    relationshipOther: value.relationshipOther,
    durationRange: value.durationRange,
    interactionMode: value.interactionMode,
    communicationPace: value.communicationPace,
    responsePreference: value.responsePreference,
    planningStyle: value.planningStyle,
    relationshipState: value.relationshipState,
    observedDifference: value.observedDifference,
    culturalContext: value.culturalContext,
    useCommunicationAi: value.useCommunicationAi,
    useRelationshipStateAi: value.useRelationshipStateAi,
    useDifferenceAi: value.useDifferenceAi,
    useCultureAi: value.useCultureAi,
    useInviterSharedAi: value.useInviterSharedAi,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[]): T | null {
  return value === null || value === undefined ? null : values.includes(value as T) ? value as T : invalid();
}

function nullableText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" && value.length <= max ? value : invalid();
}

function text(value: unknown, max: number): string {
  return nullableText(value, max) ?? "";
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
}

function bool(value: unknown, fallback: boolean): boolean {
  return value === undefined ? fallback : typeof value === "boolean" ? value : invalid();
}

function invalid(): never {
  throw new Error("资料服务返回了无效数据，请稍后重试。");
}

const values = <T extends readonly { value: string }[]>(items: T) => items.map((item) => item.value) as Array<OptionValue<T>>;

export function parseUserProfile(value: unknown): UserProfile {
  if (!isRecord(value) || !["MISSING", "ACTIVE"].includes(String(value.status))) invalid();
  const missing = value.status === "MISSING";
  const displayName = missing ? "" : text(value.displayName, 30);
  if (!missing && !displayName.trim()) invalid();
  return {
    status: value.status as UserProfile["status"],
    displayName,
    responseLength: optionalEnum(value.responseLength, values(responseLengthOptions)),
    language: nullableText(value.language, 30),
    useResponseLengthAi: bool(value.useResponseLengthAi, true),
    useLanguageAi: bool(value.useLanguageAi, true),
    revision: integer(value.revision),
    consentRevision: integer(value.consentRevision),
    updatedAt: nullableText(value.updatedAt, 64),
  };
}

function parseShared(value: unknown): SharedRelationshipContext {
  if (!isRecord(value) || !["MISSING", "DRAFT", "CONFIRMED", "SKIPPED"].includes(String(value.status))) invalid();
  return {
    status: value.status as SharedRelationshipContext["status"],
    draftStep: integer(value.draftStep ?? 1),
    relationshipType: optionalEnum(value.relationshipType, values(relationshipTypeOptions)),
    relationshipOther: nullableText(value.relationshipOther, 30),
    durationRange: optionalEnum(value.durationRange, values(durationOptions)),
    interactionMode: optionalEnum(value.interactionMode, values(interactionOptions)),
    useSharedAi: bool(value.useSharedAi, true),
    revision: integer(value.revision),
    consentRevision: integer(value.consentRevision ?? 0),
    updatedAt: nullableText(value.updatedAt, 64),
  };
}

function parseParticipant(value: unknown): ParticipantRelationshipContext {
  if (!isRecord(value) || !["MISSING", "DRAFT", "CONFIRMED", "DIFFERENT", "SKIPPED"].includes(String(value.status))) invalid();
  return {
    status: value.status as ParticipantRelationshipContext["status"],
    draftStep: integer(value.draftStep ?? 1),
    draftDecision: optionalEnum(value.draftDecision, ["CONFIRMED", "DIFFERENT", "SKIPPED"] as const),
    seenSharedRevision: integer(value.seenSharedRevision),
    relationshipType: optionalEnum(value.relationshipType, values(relationshipTypeOptions)),
    relationshipOther: nullableText(value.relationshipOther, 30),
    durationRange: optionalEnum(value.durationRange, values(durationOptions)),
    interactionMode: optionalEnum(value.interactionMode, values(interactionOptions)),
    communicationPace: optionalEnum(value.communicationPace, values(communicationPaceOptions)),
    responsePreference: optionalEnum(value.responsePreference, values(responsePreferenceOptions)),
    planningStyle: optionalEnum(value.planningStyle, values(planningStyleOptions)),
    relationshipState: optionalEnum(value.relationshipState, values(relationshipStateOptions)),
    observedDifference: text(value.observedDifference, 300),
    culturalContext: text(value.culturalContext, 300),
    useCommunicationAi: bool(value.useCommunicationAi, true),
    useRelationshipStateAi: bool(value.useRelationshipStateAi, true),
    useDifferenceAi: bool(value.useDifferenceAi, true),
    useCultureAi: bool(value.useCultureAi, false),
    useInviterSharedAi: bool(value.useInviterSharedAi, false),
    revision: integer(value.revision),
    consentRevision: integer(value.consentRevision),
    updatedAt: nullableText(value.updatedAt, 64),
  };
}

export function parseRoomRelationshipContext(value: unknown): RoomRelationshipContext {
  if (!isRecord(value) || (value.role !== "A" && value.role !== "B")) invalid();
  let recipientResponse: RecipientRelationshipResponse = null;
  if (value.recipientResponse !== null && value.recipientResponse !== undefined) {
    if (!isRecord(value.recipientResponse) ||
      !["CONFIRMED", "DIFFERENT", "SKIPPED", "PENDING"].includes(String(value.recipientResponse.status))) invalid();
    recipientResponse = {
      status: value.recipientResponse.status as NonNullable<RecipientRelationshipResponse>["status"],
      seenSharedRevision: integer(value.recipientResponse.seenSharedRevision),
      relationshipType: optionalEnum(value.recipientResponse.relationshipType, values(relationshipTypeOptions)),
      relationshipOther: nullableText(value.recipientResponse.relationshipOther, 30),
      durationRange: optionalEnum(value.recipientResponse.durationRange, values(durationOptions)),
      interactionMode: optionalEnum(value.recipientResponse.interactionMode, values(interactionOptions)),
    };
  }
  return { role: value.role, shared: parseShared(value.shared), mine: parseParticipant(value.mine), recipientResponse };
}

export function optionLabel(items: readonly { value: string; label: string }[], value: string | null) {
  return items.find((item) => item.value === value)?.label ?? "暂不填写";
}

export function normalizeDisplayName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function shouldOfferNameOnlySave(status: UserProfile["status"]) {
  return status === "MISSING";
}
