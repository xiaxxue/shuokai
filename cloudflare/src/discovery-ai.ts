import { requestStructuredOutput } from "./cloudflare-ai.ts";
import { isRepeatedConversationQuestion } from "./expression-dialogue.ts";
import type { WorkerEnv } from "./http.ts";

export type DiscoveryTurn = {
  question: string;
  answer: string;
};

export const discoverySectionFields = {
  event: [
    "participants", "setting", "trigger", "keyInteraction",
    "conflictPoint", "historyPattern", "currentState",
  ],
  userImpact: ["emotion", "physicalReaction", "realLifeConsequence"],
  meaningToCommunicate: ["personalMeaning", "underlyingNeed"],
  desiredResponse: ["desiredUnderstanding", "desiredAction", "acceptableAlternative"],
} as const;

type DiscoverySection = keyof typeof discoverySectionFields;
type EventField = typeof discoverySectionFields.event[number];
type UserImpactField = typeof discoverySectionFields.userImpact[number];
type MeaningField = typeof discoverySectionFields.meaningToCommunicate[number];
type DesiredResponseField = typeof discoverySectionFields.desiredResponse[number];
export type DiscoveryField =
  | `event.${EventField}`
  | `userImpact.${UserImpactField}`
  | `meaningToCommunicate.${MeaningField}`
  | `desiredResponse.${DesiredResponseField}`;

type DiscoveryDetailCoverage = {
  status: "ENOUGH" | "MISSING" | "NOT_RELEVANT";
  evidence: string[];
  missingInfo: string;
  relevanceReason: string;
};

type DiscoveryCoverage = {
  event: Record<EventField, DiscoveryDetailCoverage>;
  userImpact: Record<UserImpactField, DiscoveryDetailCoverage>;
  meaningToCommunicate: Record<MeaningField, DiscoveryDetailCoverage>;
  desiredResponse: Record<DesiredResponseField, DiscoveryDetailCoverage>;
};

export type DiscoveryResult = {
  schemaVersion: 3;
  ready: boolean;
  coverage: DiscoveryCoverage;
  latestAnswerUpdate: {
    absorbed: boolean;
    updatedFields: DiscoveryField[];
  };
  nextQuestion: {
    focusField: DiscoveryField | "none";
    text: string;
    purpose: string;
  };
  safetyDisposition: "ALLOW" | "WARN" | "BLOCK_SHARE" | "PAUSE";
  safetyMessage: string;
  conversationSummary: string;
  memoryCandidates: Array<{
    kind: "NEED" | "TRIGGER" | "PREFERENCE" | "BOUNDARY" | "REPAIR_PATTERN";
    content: string;
    reason: string;
    evidence: string;
  }>;
};

export type DiscoveryMemoryContext = {
  personal: Array<{ kind: string; content: string }>;
  relationship: Array<{ kind: string; content: string }>;
  onboarding?: {
    version: {
      profileRevision: number;
      participantRevision: number;
      sharedRevision: number;
      consentRevision: number;
      seenSharedRevision: number;
    };
    profile: Record<string, string>;
    myContext: Record<string, string>;
    sharedContext: Record<string, string>;
  };
};

const discoverySections = Object.keys(discoverySectionFields) as DiscoverySection[];
export const discoveryFields = discoverySections.flatMap((section) =>
  discoverySectionFields[section].map((field) => `${section}.${field}` as DiscoveryField));
const requiredEventFields: readonly EventField[] = [
  "participants", "trigger", "keyInteraction", "conflictPoint",
];

export const discoveryFieldDefinitions: Record<DiscoveryField, string> = {
  "event.participants": "这件事涉及哪些角色以及他们与当前用户的关系；不索取真实姓名。",
  "event.setting": "影响理解的时间、地点或当时场景；只需必要背景，不机械索取精确地址。",
  "event.trigger": "什么事情、请求或话语引发了这次互动。",
  "event.keyInteraction": "双方关键的原话、行动和回应；对方的态度、情绪或评价只属于这里。",
  "event.conflictPoint": "双方具体在哪个理解、需要、做法或期待上没有对齐。",
  "event.historyPattern": "这是一次偶发事件还是反复出现的相似模式。",
  "event.currentState": "事情后来如何发展，现在是已解决、搁置、持续冲突还是尚未沟通。",
  "userImpact.emotion": "当前用户本人明确说出的情绪感受。",
  "userImpact.physicalReaction": "当前用户本人明确说出的身体反应或身体状态变化。",
  "userImpact.realLifeConsequence": "事件对当前用户生活、睡眠、工作、关系或行为造成的现实后果。",
  "meaningToCommunicate.personalMeaning": "当前用户希望对方理解这件事对自己代表什么。",
  "meaningToCommunicate.underlyingNeed": "当前用户希望被看见的需要、价值或边界。",
  "desiredResponse.desiredUnderstanding": "当前用户希望对方最终理解或承认什么。",
  "desiredResponse.desiredAction": "当前用户希望对方以后采取、停止或改变什么具体行动。",
  "desiredResponse.acceptableAlternative": "如果首选回应做不到，当前用户可以接受的替代方式；也可明确表示不要求具体改变。",
} as const;
const discoveryFieldSchema = { type: "string", enum: [...discoveryFields] } as const;
const coverageDetailSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "evidence", "missingInfo", "relevanceReason"],
  properties: {
    status: { type: "string", enum: ["ENOUGH", "MISSING", "NOT_RELEVANT"] },
    evidence: {
      type: "array",
      maxItems: 3,
      items: { type: "string", maxLength: 240 },
    },
    missingInfo: { type: "string", maxLength: 300 },
    relevanceReason: { type: "string", maxLength: 300 },
  },
} as const;

function coverageSectionSchema(section: DiscoverySection) {
  return {
    type: "object",
    additionalProperties: false,
    required: [...discoverySectionFields[section]],
    properties: Object.fromEntries(discoverySectionFields[section].map((field) => {
      const path = `${section}.${field}` as DiscoveryField;
      return [field, { ...coverageDetailSchema, description: discoveryFieldDefinitions[path] }];
    })),
  };
}

export const discoveryResultSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "ready", "coverage", "latestAnswerUpdate",
    "nextQuestion", "safetyDisposition", "safetyMessage",
    "conversationSummary", "memoryCandidates",
  ],
  properties: {
    schemaVersion: { type: "integer", enum: [3] },
    ready: { type: "boolean" },
    coverage: {
      type: "object",
      additionalProperties: false,
      required: [...discoverySections],
      properties: Object.fromEntries(discoverySections.map((section) =>
        [section, coverageSectionSchema(section)])),
    },
    latestAnswerUpdate: {
      type: "object",
      additionalProperties: false,
      required: ["absorbed", "updatedFields"],
      properties: {
        absorbed: { type: "boolean" },
        updatedFields: {
          type: "array",
          maxItems: discoveryFields.length,
          items: discoveryFieldSchema,
        },
      },
    },
    nextQuestion: {
      type: "object",
      additionalProperties: false,
      required: ["focusField", "text", "purpose"],
      properties: {
        focusField: { type: "string", enum: [...discoveryFields, "none"] },
        text: { type: "string", maxLength: 500 },
        purpose: { type: "string", maxLength: 300 },
      },
    },
    safetyDisposition: { type: "string", enum: ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"] },
    safetyMessage: { type: "string", maxLength: 1000 },
    conversationSummary: { type: "string", maxLength: 600 },
    memoryCandidates: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "content", "reason", "evidence"],
        properties: {
          kind: { type: "string", enum: ["NEED", "TRIGGER", "PREFERENCE", "BOUNDARY", "REPAIR_PATTERN"] },
          content: { type: "string", maxLength: 600 },
          reason: { type: "string", maxLength: 600 },
          evidence: { type: "string", maxLength: 240 },
        },
      },
    },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function normalizedEvidenceText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\p{P}\p{S}\s]/gu, "");
}

function groundedEvidence(value: unknown, sourceMaterials: string[]) {
  if (!Array.isArray(value)) return [];
  return value.filter((evidence): evidence is string => {
    if (typeof evidence !== "string" || !evidence.trim() || evidence.length > 240) return false;
    const normalized = normalizedEvidenceText(evidence);
    return Boolean(normalized) && sourceMaterials.some((material) => material.includes(normalized));
  });
}

export function normalizeDiscoveryResult(
  value: unknown,
  input: { sourceText: string; turns: DiscoveryTurn[] },
): unknown {
  if (!isRecord(value) || !isRecord(value.coverage)) return value;
  const sourceMaterials = [
    input.sourceText,
    ...input.turns.map((turn) => turn.answer),
  ].map(normalizedEvidenceText);
  const coverage: Record<string, unknown> = {};

  for (const section of discoverySections) {
    const rawSection = value.coverage[section];
    if (!isRecord(rawSection)) {
      coverage[section] = rawSection;
      continue;
    }
    const normalizedSection: Record<string, unknown> = {};
    for (const field of discoverySectionFields[section]) {
      const item = rawSection[field];
      if (!isRecord(item)) {
        normalizedSection[field] = item;
        continue;
      }
      const evidence = groundedEvidence(item.evidence, sourceMaterials);
      const status = item.status === "ENOUGH" && evidence.length === 0 ? "MISSING" : item.status;
      normalizedSection[field] = status === "ENOUGH"
        ? { ...item, status, evidence, missingInfo: "", relevanceReason: "" }
        : status === "NOT_RELEVANT"
          ? {
            ...item,
            status,
            evidence: [],
            missingInfo: "",
            relevanceReason: typeof item.relevanceReason === "string" && item.relevanceReason.trim()
              ? item.relevanceReason
              : "该信息不影响本次理解",
          }
          : {
            ...item,
            status: "MISSING",
            evidence,
            missingInfo: typeof item.missingInfo === "string" && item.missingInfo.trim()
              ? item.missingInfo
              : "缺少可由用户原话确认的信息",
            relevanceReason: "",
          };
    }
    coverage[section] = normalizedSection;
  }

  const latestAnswer = normalizedEvidenceText(input.turns.at(-1)?.answer ?? "");
  const updatedFields = input.turns.length === 0 ? [] : discoveryFields.filter((path) => {
    const item = coverageItemAtPath(coverage, path);
    return isRecord(item) && Array.isArray(item.evidence) && item.evidence.some((evidence) =>
      typeof evidence === "string" && latestAnswer.includes(normalizedEvidenceText(evidence)));
  });
  const allCovered = discoveryCoverageIsReady(coverage);
  const safetyStopped = ["BLOCK_SHARE", "PAUSE"].includes(String(value.safetyDisposition));
  const memoryCandidates = allCovered && !safetyStopped && Array.isArray(value.memoryCandidates)
    ? value.memoryCandidates.filter((item) => isRecord(item) &&
      typeof item.evidence === "string" &&
      groundedEvidence([item.evidence], sourceMaterials).length === 1)
    : [];

  return {
    ...value,
    schemaVersion: 3,
    ready: allCovered,
    coverage,
    latestAnswerUpdate: {
      absorbed: input.turns.length > 0,
      updatedFields,
    },
    nextQuestion: allCovered || safetyStopped
      ? { focusField: "none", text: "", purpose: "" }
      : value.nextQuestion,
    memoryCandidates,
  };
}

function coverageItemAtPath(coverage: Record<string, unknown>, path: DiscoveryField) {
  const [section, field] = path.split(".");
  const sectionValue = coverage[section];
  return isRecord(sectionValue) ? sectionValue[field] : undefined;
}

function resolvedSectionHasEvidence(
  coverage: Record<string, unknown>,
  section: Exclude<DiscoverySection, "event">,
) {
  return discoverySectionFields[section].every((field) => {
    const item = coverageItemAtPath(coverage, `${section}.${field}` as DiscoveryField);
    return isRecord(item) && item.status !== "MISSING";
  }) && discoverySectionFields[section].some((field) => {
    const item = coverageItemAtPath(coverage, `${section}.${field}` as DiscoveryField);
    return isRecord(item) && item.status === "ENOUGH";
  });
}

export function discoveryCoverageIsReady(coverage: Record<string, unknown>) {
  const eventResolved = discoverySectionFields.event.every((field) => {
    const item = coverageItemAtPath(coverage, `event.${field}`);
    return isRecord(item) && item.status !== "MISSING";
  });
  const eventCoreEnough = requiredEventFields.every((field) => {
    const item = coverageItemAtPath(coverage, `event.${field}`);
    return isRecord(item) && item.status === "ENOUGH";
  });
  return eventResolved && eventCoreEnough &&
    resolvedSectionHasEvidence(coverage, "userImpact") &&
    resolvedSectionHasEvidence(coverage, "meaningToCommunicate") &&
    resolvedSectionHasEvidence(coverage, "desiredResponse");
}

function validateDetailCoverage(value: unknown, sourceMaterials: string[]) {
  if (!isRecord(value) ||
    !hasExactKeys(value, ["status", "evidence", "missingInfo", "relevanceReason"]) ||
    !["ENOUGH", "MISSING", "NOT_RELEVANT"].includes(String(value.status)) ||
    !Array.isArray(value.evidence) || value.evidence.length > 3 ||
    !value.evidence.every((evidence) => typeof evidence === "string" &&
      evidence.trim() && evidence.length <= 240 &&
      sourceMaterials.some((material) => material.includes(normalizedEvidenceText(evidence)))) ||
    typeof value.missingInfo !== "string" || value.missingInfo.length > 300 ||
    typeof value.relevanceReason !== "string" || value.relevanceReason.length > 300) return null;
  if (value.status === "ENOUGH" &&
    (!value.evidence.length || value.missingInfo.trim() || value.relevanceReason.trim())) return null;
  if (value.status === "MISSING" &&
    (!value.missingInfo.trim() || value.relevanceReason.trim())) return null;
  if (value.status === "NOT_RELEVANT" &&
    (value.evidence.length || value.missingInfo.trim() || !value.relevanceReason.trim())) return null;
  return {
    status: value.status,
    evidence: value.evidence,
    missingInfo: value.missingInfo,
    relevanceReason: value.relevanceReason,
  } as DiscoveryDetailCoverage;
}

function validateCoverage(value: unknown, sourceMaterials: string[]) {
  if (!isRecord(value) || !hasExactKeys(value, discoverySections)) return null;
  const coverage: Record<string, Record<string, DiscoveryDetailCoverage>> = {};
  for (const section of discoverySections) {
    const sectionValue = value[section];
    if (!isRecord(sectionValue) || !hasExactKeys(sectionValue, discoverySectionFields[section])) return null;
    const validatedSection: Record<string, DiscoveryDetailCoverage> = {};
    for (const field of discoverySectionFields[section]) {
      const detail = validateDetailCoverage(sectionValue[field], sourceMaterials);
      if (!detail) return null;
      validatedSection[field] = detail;
    }
    coverage[section] = validatedSection;
  }
  return coverage as DiscoveryCoverage;
}

export function isDiscoveryResult(
  value: unknown,
  input: { sourceText: string; turns: DiscoveryTurn[] },
): value is DiscoveryResult {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "ready", "coverage", "latestAnswerUpdate",
    "nextQuestion", "safetyDisposition", "safetyMessage",
    "conversationSummary", "memoryCandidates",
  ]) || value.schemaVersion !== 3 || typeof value.ready !== "boolean" ||
    !isRecord(value.latestAnswerUpdate) ||
    !hasExactKeys(value.latestAnswerUpdate, ["absorbed", "updatedFields"]) ||
    typeof value.latestAnswerUpdate.absorbed !== "boolean" ||
    !Array.isArray(value.latestAnswerUpdate.updatedFields) ||
    value.latestAnswerUpdate.updatedFields.length > discoveryFields.length ||
    new Set(value.latestAnswerUpdate.updatedFields).size !== value.latestAnswerUpdate.updatedFields.length ||
    !value.latestAnswerUpdate.updatedFields.every((item) =>
      discoveryFields.includes(item as DiscoveryField)) ||
    !isRecord(value.nextQuestion) ||
    !hasExactKeys(value.nextQuestion, ["focusField", "text", "purpose"]) ||
    ![...discoveryFields, "none"].includes(String(value.nextQuestion.focusField)) ||
    typeof value.nextQuestion.text !== "string" || value.nextQuestion.text.length > 500 ||
    typeof value.nextQuestion.purpose !== "string" || value.nextQuestion.purpose.length > 300 ||
    !["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"].includes(String(value.safetyDisposition)) ||
    typeof value.safetyMessage !== "string" || value.safetyMessage.length > 1000 ||
    typeof value.conversationSummary !== "string" || !value.conversationSummary.trim() ||
    value.conversationSummary.length > 600 || !Array.isArray(value.memoryCandidates) ||
    value.memoryCandidates.length > 3) return false;

  const sourceMaterials = [
    input.sourceText,
    ...input.turns.map((turn) => turn.answer),
  ].map(normalizedEvidenceText);
  const coverage = validateCoverage(value.coverage, sourceMaterials);
  if (!coverage) return false;
  if (!value.memoryCandidates.every((item) => isRecord(item) &&
    hasExactKeys(item, ["kind", "content", "reason", "evidence"]) &&
    ["NEED", "TRIGGER", "PREFERENCE", "BOUNDARY", "REPAIR_PATTERN"].includes(String(item.kind)) &&
    typeof item.content === "string" && Boolean(item.content.trim()) && item.content.length <= 600 &&
    typeof item.reason === "string" && Boolean(item.reason.trim()) && item.reason.length <= 600 &&
    typeof item.evidence === "string" && Boolean(item.evidence.trim()) && item.evidence.length <= 240 &&
    Boolean(normalizedEvidenceText(String(item.evidence))) &&
    sourceMaterials.some((material) => material.includes(normalizedEvidenceText(String(item.evidence)))))) return false;
  const allCovered = discoveryCoverageIsReady(coverage as unknown as Record<string, unknown>);
  if (value.ready !== allCovered) return false;

  const safetyStopped = ["BLOCK_SHARE", "PAUSE"].includes(String(value.safetyDisposition));
  if ((!value.ready || safetyStopped) && value.memoryCandidates.length) return false;
  const hasStopped = value.ready || safetyStopped;
  if (hasStopped) {
    if (value.nextQuestion.focusField !== "none" ||
      value.nextQuestion.text.trim() || value.nextQuestion.purpose.trim()) return false;
  } else {
    const focus = value.nextQuestion.focusField as DiscoveryField;
    const focusCoverage = coverageItemAtPath(
      coverage as unknown as Record<string, unknown>,
      focus,
    );
    if (!discoveryFields.includes(focus) || !isRecord(focusCoverage) ||
      focusCoverage.status !== "MISSING" ||
      !value.nextQuestion.text.trim() || !value.nextQuestion.purpose.trim()) return false;
    if (isRepeatedConversationQuestion(value.nextQuestion.text, input.turns)) return false;
  }

  if (input.turns.length === 0) {
    if (value.latestAnswerUpdate.absorbed || value.latestAnswerUpdate.updatedFields.length) return false;
  } else {
    if (!value.latestAnswerUpdate.absorbed) return false;
    const latestAnswer = normalizedEvidenceText(input.turns.at(-1)?.answer ?? "");
    if (value.latestAnswerUpdate.updatedFields.some((path) => {
      const item = coverageItemAtPath(
        coverage as unknown as Record<string, unknown>,
        path as DiscoveryField,
      );
      return !isRecord(item) || !Array.isArray(item.evidence) || !item.evidence.some((evidence) =>
        typeof evidence === "string" && latestAnswer.includes(normalizedEvidenceText(evidence)));
    })) return false;
  }
  return value.safetyDisposition === "ALLOW"
    ? value.safetyMessage.trim() === ""
    : value.safetyMessage.trim() !== "";
}

export function generateDiscoveryQuestion(
  env: WorkerEnv,
  input: { sourceText: string; turns: DiscoveryTurn[]; memoryContext?: DiscoveryMemoryContext },
) {
  return requestStructuredOutput(env, {
    schemaName: "shuokai_private_discovery",
    schema: discoveryResultSchema,
    systemText: [
      "你是‘说开’的私人倾听助手。用户还没有选择表达路径；此时只通过对话理解背景，绝不能生成表达卡，也不能推荐或预设非暴力沟通、事实争议、边界声明等路径。",
      `你必须逐项维护分层理解状态。字段定义如下：${discoveryFields.map((field) => `${field}=${discoveryFieldDefinitions[field]}`).join(" ")}`,
      "event 不是一个笼统结论。participants、trigger、keyInteraction、conflictPoint 是必需核心；setting、historyPattern、currentState 也必须根据当前对话明确为 ENOUGH 或有理由的 NOT_RELEVANT，不能因为已经知道一次互动就整体结束。setting 只问影响理解的时间、地点或场景，不索取精确地址或无关细节。",
      "userImpact 的主体永远是当前正在说话的用户本人。比如“他嫌我烦”只属于 event.keyInteraction；它没有说明用户本人的感受或后果。emotion、physicalReaction、realLifeConsequence 至少一项必须 ENOUGH，其余项必须明确 ENOUGH 或 NOT_RELEVANT。不得根据对方的反应推断用户感受。",
      "“提醒我代表被爱”属于 meaningToCommunicate.personalMeaning，不能代替 userImpact，也不能自动填满 desiredResponse。meaningToCommunicate 至少一项 ENOUGH；desiredResponse 也至少一项 ENOUGH。若用户只希望被理解、不要求对方采取具体行动，必须由用户明确表达后，才能把 desiredAction 或 acceptableAlternative 标为 NOT_RELEVANT。",
      "每个最末级 coverage 项必须填写 status、evidence、missingInfo、relevanceReason。evidence 只能逐字摘录 sourceText 或用户回答，不能概括、推断或虚构。ENOUGH 至少一条证据，missingInfo 和 relevanceReason 为空；MISSING 要具体说明还缺什么，relevanceReason 为空；NOT_RELEVANT 不得有 evidence 或 missingInfo，必须说明为什么不影响本次理解。",
      "如果已有问答，先吸收最新回答：latestAnswerUpdate.absorbed=true，并用 updatedFields 标记最新回答实际补充或修正的末级字段；首次讲述 absorbed=false、updatedFields=[]。",
      "只有工程定义的所有必需信息均已解决时 ready 才能为 true。只要仍有 MISSING，ready=false，nextQuestion 必须聚焦最影响准确表达的一个 focusField，只问一个简短、具体、非诱导的问题。优先顺序不是固定的，应结合用户当前叙述，但不要连续忽略事件模式、当前状态或期望回应。",
      "下一问必须结合用户最新回答，不得重复、轻微改写或重新索取已经回答的信息。轮数不是完成依据。ready 或安全停止时 nextQuestion 必须为 {focusField:'none',text:'',purpose:''}。",
      "conversationSummary 用不超过 600 字概括事件角色与场景、触发和互动、冲突点与历史/现状、当前用户本人的影响、希望传达的意义以及期望回应；不能添加用户没说过的事实。",
      "confirmedMemory 只包含用户亲自确认的个人记忆和双方共同确认的关系记忆。仅在与本次明显相关时用它避免重复追问；不要向用户宣称你知道未在当前对话出现的隐私，也不要把记忆当成永远正确的事实。",
      "onboardingContext 只包含当前用户主动允许私人 AI 参考的资料。profile 用来调整表达方式；myContext 是用户对自己的描述；sharedContext 若 source=INVITER，表示邀请方尚未成为共同事实的版本，只能帮助理解语境，绝不能据此定义用户、推断对方动机或判断谁对谁错。不得依据年龄、性别、地域、关系类型或沟通风格套用刻板印象。",
      "只有 ready=true 且安全状态为 ALLOW 或 WARN 时，才可给出最多 3 条 memoryCandidates。候选必须是用户关于自己的、跨对象和跨沟通仍可能有用的需要、触发情境、沟通偏好、边界或有效修复方式；不得把只针对当前对方的评价、姓名、身份、一次性事件细节或对第三方的推断保存成个人记忆。content 是可编辑的简短表述，reason 说明以后何时有用，evidence 必须逐字摘录用户原话。其他情况输出空数组。",
      "你的职责只到帮助用户说清背景为止。用户选择表达路径后，另一个整理 Agent 只补充该路径特有的信息；不要提前替它生成或填写表达字段。",
      "不要评价谁对谁错，不诊断人格或关系，不推断动机，不把用户的感受改写成事实，不索取姓名、地址、联系方式、账号或诊断等非必要敏感信息。",
      "普通的难过、嫉妒、失望、争吵、关系不安或分手本身不是危险。只有分享可能带来现实危险时使用 WARN；明确的胁迫、暴力、自伤、伤人或迫近危险才使用 BLOCK_SHARE 或 PAUSE。没有真实安全风险时 safetyDisposition 必须为 ALLOW，safetyMessage 必须为空。",
      "只输出中文。",
      "始终用“你”称呼用户，不用“您”。",
    ].join("\n"),
    userData: {
      sourceText: input.sourceText,
      privateConversation: input.turns,
      confirmedMemory: {
        personal: input.memoryContext?.personal ?? [],
        relationship: input.memoryContext?.relationship ?? [],
      },
      onboardingContext: input.memoryContext?.onboarding ?? {
        profile: {}, myContext: {}, sharedContext: {},
      },
    },
    maxTokens: 2600,
    validationRetryText: [
      "evidence 只能来自 sourceText 或 privateConversation[].answer，绝不能引用 privateConversation[].question。",
      "再次检查 userImpact：证据必须是当前用户亲口说出的本人情绪、身体反应或现实后果；对方的言行、态度、情绪、评价不能填入 userImpact。",
      "再次检查 meaningToCommunicate 和 desiredResponse：希望对方理解某种意义不等于已经说明希望对方以后怎么回应。",
      "updatedFields 只能包含最新一条 answer 实际补充且对应 coverage.evidence 引用了该 answer 的末级字段。",
      "如果上一次问题与 privateConversation 中的问题重复，必须改问仍为 MISSING 的另一项具体信息。",
    ].join("\n"),
    normalize: (value) => normalizeDiscoveryResult(value, input),
    validate: (value) => isDiscoveryResult(value, input),
  });
}
