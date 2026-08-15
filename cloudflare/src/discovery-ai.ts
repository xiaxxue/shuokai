import { requestStructuredOutput } from "./cloudflare-ai.ts";
import type { WorkerEnv } from "./http.ts";

export type DiscoveryTurn = {
  question: string;
  answer: string;
};

export type DiscoveryResult = {
  question: string;
  ready: boolean;
  followUpLimitReached: boolean;
  coverage: {
    event: "ENOUGH" | "MISSING";
    impact: "ENOUGH" | "MISSING";
    intention: "ENOUGH" | "MISSING";
  };
  safetyDisposition: "ALLOW" | "WARN" | "BLOCK_SHARE" | "PAUSE";
  safetyMessage: string;
};

const MAX_DISCOVERY_TURNS = 8;
const coverageDimensionSchema = { type: "string", enum: ["ENOUGH", "MISSING"] } as const;

export const discoveryResultSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "question", "ready", "followUpLimitReached", "coverage",
    "safetyDisposition", "safetyMessage",
  ],
  properties: {
    question: { type: "string", maxLength: 500 },
    ready: { type: "boolean" },
    followUpLimitReached: { type: "boolean" },
    coverage: {
      type: "object",
      additionalProperties: false,
      required: ["event", "impact", "intention"],
      properties: {
        event: coverageDimensionSchema,
        impact: coverageDimensionSchema,
        intention: coverageDimensionSchema,
      },
    },
    safetyDisposition: { type: "string", enum: ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"] },
    safetyMessage: { type: "string", maxLength: 1000 },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDiscoveryLimit(value: unknown, atFollowUpLimit: boolean) {
  if (!isRecord(value) || !isRecord(value.coverage)) return value;
  const coverage = value.coverage;
  const allCovered = ["event", "impact", "intention"]
    .every((key) => coverage[key] === "ENOUGH");
  if (atFollowUpLimit && !allCovered) {
    return { ...value, question: "", ready: false, followUpLimitReached: true };
  }
  return { ...value, followUpLimitReached: false };
}

export function isDiscoveryResult(value: unknown): value is DiscoveryResult {
  if (!isRecord(value) || Object.keys(value).length !== 6 ||
    typeof value.question !== "string" || value.question.length > 500 ||
    typeof value.ready !== "boolean" ||
    typeof value.followUpLimitReached !== "boolean" ||
    !isRecord(value.coverage) || Object.keys(value.coverage).length !== 3 ||
    !["event", "impact", "intention"].every((key) =>
      ["ENOUGH", "MISSING"].includes(String((value.coverage as Record<string, unknown>)[key]))
    ) ||
    !["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"].includes(String(value.safetyDisposition)) ||
    typeof value.safetyMessage !== "string" || value.safetyMessage.length > 1000) return false;
  const allCovered = Object.values(value.coverage).every((status) => status === "ENOUGH");
  if (value.ready !== allCovered || (value.ready && value.followUpLimitReached)) return false;
  if ((value.ready || value.followUpLimitReached) === Boolean(value.question.trim())) return false;
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
      "你必须先判断三类信息是否足够：event=对方能理解的具体事件、言行和必要背景；impact=这件事对用户造成的感受、影响或在意之处；intention=用户希望对方理解什么，或希望沟通带来什么变化。不要因为已经问过一两轮就把任何一项标为 ENOUGH。",
      "只有 event、impact、intention 全部为 ENOUGH 时，ready 才能为 true，question 必须为空。只要还有 MISSING，ready 必须为 false，并针对最影响准确表达的一项追问一个问题。问题应基于用户说过的话，简短、具体、非诱导；不要重复已回答的问题。",
      "第一次收到原始讲述时也按三类信息判断：缺什么才问什么；如果三类确实都足够，可以直接 ready，不要为了凑对话轮数而提问。轮数不是理解完成的依据。followUpLimitReached 固定填写 false，平台会根据实际轮数处理追问上限。",
      "不要评价谁对谁错，不诊断人格或关系，不推断动机，不把用户的感受改写成事实，不索取姓名、地址、联系方式、账号或诊断等非必要敏感信息。",
      "普通的难过、嫉妒、失望、争吵、关系不安或分手本身不是危险。只有分享可能带来现实危险时使用 WARN；明确的胁迫、暴力、自伤、伤人或迫近危险才使用 BLOCK_SHARE 或 PAUSE。没有真实安全风险时 safetyDisposition 必须为 ALLOW，safetyMessage 必须为空。",
      "只输出中文。",
    ].join("\n"),
    userData: {
      sourceText: input.sourceText,
      privateConversation: input.turns,
    },
    maxTokens: 700,
    normalize: (value) => normalizeDiscoveryLimit(value, atFollowUpLimit),
    validate: (value) => {
      if (!isDiscoveryResult(value)) return false;
      if (atFollowUpLimit) return value.ready || value.followUpLimitReached;
      return !value.followUpLimitReached;
    },
  });
}
