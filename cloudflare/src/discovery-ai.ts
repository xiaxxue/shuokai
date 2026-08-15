import { requestStructuredOutput } from "./cloudflare-ai.ts";
import type { WorkerEnv } from "./http.ts";

export type DiscoveryTurn = {
  question: string;
  answer: string;
};

type DiscoveryDimension = "event" | "impact" | "intention";

type DiscoveryCoverage = {
  status: "ENOUGH" | "MISSING";
  evidence: string[];
  missingInfo: string;
};

export type DiscoveryResult = {
  ready: boolean;
  followUpLimitReached: boolean;
  coverage: Record<DiscoveryDimension, DiscoveryCoverage>;
  latestAnswerUpdate: {
    absorbed: boolean;
    updatedDimensions: DiscoveryDimension[];
  };
  nextQuestion: {
    focusDimension: DiscoveryDimension | "none";
    text: string;
    purpose: string;
  };
  safetyDisposition: "ALLOW" | "WARN" | "BLOCK_SHARE" | "PAUSE";
  safetyMessage: string;
};

const MAX_DISCOVERY_TURNS = 8;
const discoveryDimensions = ["event", "impact", "intention"] as const;
const discoveryDimensionSchema = { type: "string", enum: [...discoveryDimensions] } as const;
const coverageDimensionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "evidence", "missingInfo"],
  properties: {
    status: { type: "string", enum: ["ENOUGH", "MISSING"] },
    evidence: {
      type: "array",
      maxItems: 3,
      items: { type: "string", maxLength: 240 },
    },
    missingInfo: { type: "string", maxLength: 300 },
  },
} as const;

export const discoveryResultSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "ready", "followUpLimitReached", "coverage", "latestAnswerUpdate",
    "nextQuestion", "safetyDisposition", "safetyMessage",
  ],
  properties: {
    ready: { type: "boolean" },
    followUpLimitReached: { type: "boolean" },
    coverage: {
      type: "object",
      additionalProperties: false,
      required: [...discoveryDimensions],
      properties: {
        event: coverageDimensionSchema,
        impact: coverageDimensionSchema,
        intention: coverageDimensionSchema,
      },
    },
    latestAnswerUpdate: {
      type: "object",
      additionalProperties: false,
      required: ["absorbed", "updatedDimensions"],
      properties: {
        absorbed: { type: "boolean" },
        updatedDimensions: {
          type: "array",
          uniqueItems: true,
          maxItems: 3,
          items: discoveryDimensionSchema,
        },
      },
    },
    nextQuestion: {
      type: "object",
      additionalProperties: false,
      required: ["focusDimension", "text", "purpose"],
      properties: {
        focusDimension: { type: "string", enum: [...discoveryDimensions, "none"] },
        text: { type: "string", maxLength: 500 },
        purpose: { type: "string", maxLength: 300 },
      },
    },
    safetyDisposition: { type: "string", enum: ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"] },
    safetyMessage: { type: "string", maxLength: 1000 },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function normalizedComparisonText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\p{P}\p{S}\s]/gu, "");
}

function validateCoverage(value: unknown, sourceMaterials: string[]) {
  if (!isRecord(value) || !hasExactKeys(value, discoveryDimensions)) return null;
  const coverage = {} as Record<DiscoveryDimension, DiscoveryCoverage>;
  for (const dimension of discoveryDimensions) {
    const item = value[dimension];
    if (!isRecord(item) || !hasExactKeys(item, ["status", "evidence", "missingInfo"]) ||
      (item.status !== "ENOUGH" && item.status !== "MISSING") ||
      !Array.isArray(item.evidence) || item.evidence.length > 3 ||
      !item.evidence.every((evidence) => typeof evidence === "string" &&
        evidence.trim() && evidence.length <= 240 &&
        sourceMaterials.some((material) => material.includes(normalizedComparisonText(evidence)))) ||
      typeof item.missingInfo !== "string" || item.missingInfo.length > 300 ||
      (item.status === "ENOUGH" && (!item.evidence.length || item.missingInfo.trim())) ||
      (item.status === "MISSING" && !item.missingInfo.trim())) return null;
    coverage[dimension] = {
      status: item.status,
      evidence: item.evidence,
      missingInfo: item.missingInfo,
    };
  }
  return coverage;
}

function normalizeDiscoveryLimit(value: unknown, atFollowUpLimit: boolean) {
  if (!isRecord(value) || !isRecord(value.coverage) || !isRecord(value.nextQuestion)) return value;
  const coverage = value.coverage;
  const allCovered = discoveryDimensions
    .every((dimension) => isRecord(coverage[dimension]) &&
      coverage[dimension].status === "ENOUGH");
  if (atFollowUpLimit && !allCovered) {
    return {
      ...value,
      ready: false,
      followUpLimitReached: true,
      nextQuestion: { focusDimension: "none", text: "", purpose: "" },
    };
  }
  return { ...value, followUpLimitReached: false };
}

export function isDiscoveryResult(
  value: unknown,
  input: { sourceText: string; turns: DiscoveryTurn[] },
): value is DiscoveryResult {
  if (!isRecord(value) || !hasExactKeys(value, [
    "ready", "followUpLimitReached", "coverage", "latestAnswerUpdate",
    "nextQuestion", "safetyDisposition", "safetyMessage",
  ]) || typeof value.ready !== "boolean" || typeof value.followUpLimitReached !== "boolean" ||
    !isRecord(value.latestAnswerUpdate) ||
    !hasExactKeys(value.latestAnswerUpdate, ["absorbed", "updatedDimensions"]) ||
    typeof value.latestAnswerUpdate.absorbed !== "boolean" ||
    !Array.isArray(value.latestAnswerUpdate.updatedDimensions) ||
    value.latestAnswerUpdate.updatedDimensions.length > 3 ||
    new Set(value.latestAnswerUpdate.updatedDimensions).size !== value.latestAnswerUpdate.updatedDimensions.length ||
    !value.latestAnswerUpdate.updatedDimensions.every((item) =>
      discoveryDimensions.includes(item as DiscoveryDimension)) ||
    !isRecord(value.nextQuestion) ||
    !hasExactKeys(value.nextQuestion, ["focusDimension", "text", "purpose"]) ||
    ![...discoveryDimensions, "none"].includes(String(value.nextQuestion.focusDimension)) ||
    typeof value.nextQuestion.text !== "string" || value.nextQuestion.text.length > 500 ||
    typeof value.nextQuestion.purpose !== "string" || value.nextQuestion.purpose.length > 300 ||
    !["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"].includes(String(value.safetyDisposition)) ||
    typeof value.safetyMessage !== "string" || value.safetyMessage.length > 1000) return false;

  const sourceMaterials = [
    input.sourceText,
    ...input.turns.map((turn) => turn.answer),
  ].map(normalizedComparisonText);
  const coverage = validateCoverage(value.coverage, sourceMaterials);
  if (!coverage) return false;
  const allCovered = discoveryDimensions.every((dimension) => coverage[dimension].status === "ENOUGH");
  if (value.ready !== allCovered || (value.ready && value.followUpLimitReached)) return false;

  const hasStopped = value.ready || value.followUpLimitReached;
  if (hasStopped) {
    if (value.nextQuestion.focusDimension !== "none" ||
      value.nextQuestion.text.trim() || value.nextQuestion.purpose.trim()) return false;
  } else {
    const focus = value.nextQuestion.focusDimension as DiscoveryDimension;
    if (!discoveryDimensions.includes(focus) || coverage[focus].status !== "MISSING" ||
      !value.nextQuestion.text.trim() || !value.nextQuestion.purpose.trim()) return false;
    const nextQuestion = normalizedComparisonText(value.nextQuestion.text);
    if (!nextQuestion || input.turns.some((turn) =>
      normalizedComparisonText(turn.question) === nextQuestion)) return false;
  }

  if (input.turns.length === 0) {
    if (value.latestAnswerUpdate.absorbed || value.latestAnswerUpdate.updatedDimensions.length) return false;
  } else {
    if (!value.latestAnswerUpdate.absorbed) return false;
    const latestAnswer = normalizedComparisonText(input.turns.at(-1)?.answer ?? "");
    if (value.latestAnswerUpdate.updatedDimensions.some((dimension) =>
      !coverage[dimension as DiscoveryDimension].evidence.some((evidence) =>
        latestAnswer.includes(normalizedComparisonText(evidence))))) return false;
  }

  return value.safetyDisposition === "ALLOW"
    ? value.safetyMessage.trim() === ""
    : value.safetyMessage.trim() !== "";
}

export function generateDiscoveryQuestion(
  env: WorkerEnv,
  input: { sourceText: string; turns: DiscoveryTurn[] },
) {
  const atFollowUpLimit = input.turns.length >= MAX_DISCOVERY_TURNS;
  return requestStructuredOutput(env, {
    schemaName: "shuokai_private_discovery",
    schema: discoveryResultSchema,
    systemText: [
      "你是‘说开’的私人倾听助手。用户还没有选择表达路径；此时只通过对话理解背景，绝不能生成表达卡，也不能推荐或预设非暴力沟通、事实争议、边界声明等路径。",
      "你必须维护三类理解状态：event=对方能理解的具体事件、言行和必要背景；impact=这件事对用户造成的感受、影响或在意之处；intention=用户希望对方理解什么，或希望沟通带来什么变化。",
      "每个 coverage 项都必须填写 status、evidence、missingInfo。evidence 只能逐字摘录 sourceText 或用户回答中的短句，不能概括、推断或虚构；ENOUGH 至少需要一条证据且 missingInfo 为空，MISSING 必须具体说明还缺什么。",
      "如果已有问答，先吸收用户最新回答：latestAnswerUpdate.absorbed 必须为 true，并用 updatedDimensions 标记它补充或修正了哪些维度；首次讲述时 absorbed=false、updatedDimensions=[]。",
      "只有 event、impact、intention 全部为 ENOUGH 时，ready 才能为 true。只要还有 MISSING，ready 必须为 false，nextQuestion 必须针对最影响准确表达的一项，只问一个简短、具体、非诱导的问题，并在 purpose 中说明要补的具体信息。",
      "下一问必须结合用户最新回答，不得重复、轻微改写或重新索取 privateConversation 中已经回答的信息。第一次讲述如果三类都足够，可以直接 ready；轮数不是理解完成的依据。",
      "followUpLimitReached 固定填写 false，平台会根据实际轮数处理追问上限。ready 或停止追问时，nextQuestion 必须为 {focusDimension:'none',text:'',purpose:''}。",
      "不要评价谁对谁错，不诊断人格或关系，不推断动机，不把用户的感受改写成事实，不索取姓名、地址、联系方式、账号或诊断等非必要敏感信息。",
      "普通的难过、嫉妒、失望、争吵、关系不安或分手本身不是危险。只有分享可能带来现实危险时使用 WARN；明确的胁迫、暴力、自伤、伤人或迫近危险才使用 BLOCK_SHARE 或 PAUSE。没有真实安全风险时 safetyDisposition 必须为 ALLOW，safetyMessage 必须为空。",
      "只输出中文。",
    ].join("\n"),
    userData: {
      sourceText: input.sourceText,
      privateConversation: input.turns,
    },
    maxTokens: 1100,
    validationRetryText: "如果上一次问题与 privateConversation 中的问题重复，必须改问仍为 MISSING 的另一项具体信息。",
    normalize: (value) => normalizeDiscoveryLimit(value, atFollowUpLimit),
    validate: (value) => {
      if (!isDiscoveryResult(value, input)) return false;
      if (atFollowUpLimit) return value.ready || value.followUpLimitReached;
      return !value.followUpLimitReached;
    },
  });
}
