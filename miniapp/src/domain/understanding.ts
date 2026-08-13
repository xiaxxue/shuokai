import type { RoomSession } from "./types";

const understandingFields = [
  "observation", "feeling", "need", "request", "claim", "basis", "verificationRequest",
  "boundary", "reason", "acceptableRange", "selfProtectiveAction",
] as const;
export type UnderstandingSource =
  | `${"A" | "B"}.${typeof understandingFields[number]}`
  | `DIALOGUE.${"OPENING" | "REFLECTION" | "REFLECTION_CONFIRMATION" | "RESPONSE"}.${"A" | "B"}.${number}`;

function isUnderstandingSource(value: unknown): value is UnderstandingSource {
  if (typeof value !== "string") return false;
  if (/^DIALOGUE\.(OPENING|REFLECTION|REFLECTION_CONFIRMATION|RESPONSE)\.[AB]\.[1-9]\d*$/.test(value)) return true;
  const [role, field] = value.split(".");
  return ["A", "B"].includes(role) && understandingFields.includes(field as typeof understandingFields[number]);
}

export type EvidenceItem = {
  text: string;
  sources: UnderstandingSource[];
};

export type UnderstandingDifference = {
  topic: string;
  sideA: string;
  sideB: string;
  sources: UnderstandingSource[];
};

export type SharedUnderstanding = {
  schemaVersion: 1;
  commonGround: EvidenceItem[];
  differences: UnderstandingDifference[];
  unverifiedFacts: EvidenceItem[];
  boundaries: EvidenceItem[];
  candidateUnderstanding: EvidenceItem;
  coreQuestion: EvidenceItem;
};

export type UnderstandingStatus = {
  phase: NonNullable<RoomSession["phaseV2"]>;
  status: "WAITING" | "QUEUED" | "PROCESSING" | "FAILED_RETRYABLE" | "FAILED_FINAL" |
    "STALE" | "CANCELED" | "PAUSED" | "SUCCEEDED";
  progress: Partial<Record<"A" | "B", "NOT_JOINED" | "ORGANIZING" | "CONFIRMED" | "PAUSED" | "ENDED">>;
  result: null | {
    id: string;
    version: number;
    contentHash: string;
    payload: SharedUnderstanding;
    publishedAt: string;
  };
  ownDecision: "ACCURATE" | "INACCURATE" | null;
  accurateCount: number;
  errorCode: string | null;
};

export type UnderstandingConfirmation = {
  decision: "ACCURATE" | "INACCURATE";
  accurateCount: number;
  bothConfirmed: boolean;
  phase: "UNDERSTANDING_CONFIRMING" | "ACTION_GENERATING";
};

function canonicalDisplayText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function uniqueDisplayItems<T>(items: readonly T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalizedKey = key(item);
    if (seen.has(normalizedKey)) return false;
    seen.add(normalizedKey);
    return true;
  });
}

export function sharedUnderstandingDisplay(value: SharedUnderstanding): SharedUnderstanding {
  const evidence = (items: readonly EvidenceItem[]) => uniqueDisplayItems(
    items,
    (item) => canonicalDisplayText(item.text),
  );
  return {
    ...value,
    commonGround: evidence(value.commonGround),
    differences: uniqueDisplayItems(
      value.differences,
      (item) => [item.topic, item.sideA, item.sideB].map(canonicalDisplayText).join("\u0000"),
    ),
    unverifiedFacts: evidence(value.unverifiedFacts),
    boundaries: evidence(value.boundaries),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEvidence(value: unknown): value is EvidenceItem {
  return isRecord(value) && Object.keys(value).length === 2 &&
    typeof value.text === "string" && value.text.length <= 1200 &&
    Array.isArray(value.sources) && value.sources.length > 0 && value.sources.length <= 8 &&
    value.sources.every(isUnderstandingSource);
}

export function isSharedUnderstanding(value: unknown): value is SharedUnderstanding {
  return isRecord(value) && Object.keys(value).length === 7 && value.schemaVersion === 1 &&
    Array.isArray(value.commonGround) && value.commonGround.length <= 6 && value.commonGround.every(isEvidence) &&
    Array.isArray(value.unverifiedFacts) && value.unverifiedFacts.length <= 6 && value.unverifiedFacts.every(isEvidence) &&
    Array.isArray(value.boundaries) && value.boundaries.length <= 6 && value.boundaries.every(isEvidence) &&
    Array.isArray(value.differences) && value.differences.length <= 6 && value.differences.every((difference) =>
      isRecord(difference) && Object.keys(difference).length === 4 &&
      typeof difference.topic === "string" && difference.topic.length <= 500 &&
      typeof difference.sideA === "string" && difference.sideA.length <= 1200 &&
      typeof difference.sideB === "string" && difference.sideB.length <= 1200 &&
      Array.isArray(difference.sources) && difference.sources.length > 0 && difference.sources.length <= 8 &&
      difference.sources.every(isUnderstandingSource)) &&
    isEvidence(value.candidateUnderstanding) && isEvidence(value.coreQuestion);
}

export function parseUnderstandingStatus(value: unknown): UnderstandingStatus {
  const phases: Array<NonNullable<RoomSession["phaseV2"]>> = [
    "SETUP", "PRIVATE_EXPRESSION", "DIALOGUE", "UNDERSTANDING_GENERATING", "UNDERSTANDING_CONFIRMING",
    "ACTION_GENERATING", "ACTION_CONFIRMING", "PAUSED", "COMPLETED", "ENDED",
  ];
  const statuses = [
    "WAITING", "QUEUED", "PROCESSING", "FAILED_RETRYABLE", "FAILED_FINAL",
    "STALE", "CANCELED", "PAUSED", "SUCCEEDED",
  ];
  const progressValues = ["NOT_JOINED", "ORGANIZING", "CONFIRMED", "PAUSED", "ENDED"];
  if (!isRecord(value) || typeof value.phase !== "string" ||
    !phases.includes(value.phase as NonNullable<RoomSession["phaseV2"]>) ||
    typeof value.status !== "string" ||
    !statuses.includes(value.status) || !isRecord(value.progress) ||
    Object.keys(value.progress).some((role) => !["A", "B"].includes(role)) ||
    Object.values(value.progress).some((progress) => !progressValues.includes(String(progress))) ||
    typeof value.accurateCount !== "number" || !Number.isInteger(value.accurateCount) ||
    value.accurateCount < 0 || value.accurateCount > 2 ||
    (value.ownDecision !== null && value.ownDecision !== "ACCURATE" && value.ownDecision !== "INACCURATE") ||
    (value.errorCode !== null && typeof value.errorCode !== "string")) {
    throw new Error("数据服务返回了无效共同理解状态，请稍后重试。");
  }
  if (value.result !== null) {
    if (!isRecord(value.result) || typeof value.result.id !== "string" ||
      typeof value.result.version !== "number" || !Number.isInteger(value.result.version) ||
      typeof value.result.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(value.result.contentHash) ||
      typeof value.result.publishedAt !== "string" || !isSharedUnderstanding(value.result.payload)) {
      throw new Error("数据服务返回了无效共同理解，请稍后重试。");
    }
  }
  return value as UnderstandingStatus;
}

export function parseUnderstandingConfirmation(value: unknown): UnderstandingConfirmation {
  if (!isRecord(value) ||
    (value.decision !== "ACCURATE" && value.decision !== "INACCURATE") ||
    typeof value.accurateCount !== "number" || !Number.isInteger(value.accurateCount) ||
    value.accurateCount < 0 || value.accurateCount > 2 ||
    typeof value.bothConfirmed !== "boolean" ||
    (value.phase !== "UNDERSTANDING_CONFIRMING" && value.phase !== "ACTION_GENERATING") ||
    value.bothConfirmed !== (value.accurateCount === 2) ||
    (value.phase === "ACTION_GENERATING") !== value.bothConfirmed) {
    throw new Error("数据服务返回了无效确认状态，请刷新后重试。");
  }
  return value as UnderstandingConfirmation;
}

export function sourceLabel(source: UnderstandingSource) {
  const dialogueMatch = /^DIALOGUE\.(OPENING|REFLECTION|REFLECTION_CONFIRMATION|RESPONSE)\.([AB])\.(\d+)$/.exec(source);
  if (dialogueMatch) {
    const kindLabels = {
      OPENING: "表达",
      REFLECTION: "复述",
      REFLECTION_CONFIRMATION: "确认",
      RESPONSE: "回应",
    } as const;
    return `第 ${dialogueMatch[3]} 条 · ${dialogueMatch[2] === "A" ? "发起者" : "受邀者"}${kindLabels[dialogueMatch[1] as keyof typeof kindLabels]}`;
  }
  const [role, field] = source.split(".");
  const fieldLabels: Record<string, string> = {
    observation: "观察", feeling: "感受", need: "需要", request: "请求",
    claim: "主张", basis: "依据", verificationRequest: "待核实事项",
    boundary: "边界", reason: "原因", acceptableRange: "可接受范围",
    selfProtectiveAction: "自我保护行动",
  };
  return `${role === "A" ? "发起者" : "受邀者"} · ${fieldLabels[field] ?? field}`;
}
