import { requestStructuredOutput } from "./cloudflare-ai.ts";
import {
  isRepeatedConversationQuestion,
  maxReflectiveConversationTurns,
} from "./expression-dialogue.ts";
import type { WorkerEnv } from "./http.ts";

export type DiscoveryTurn = {
  question: string;
  answer: string;
};

export type DiscoveryResult = {
  question: string;
  ready: boolean;
  safetyDisposition: "ALLOW" | "WARN" | "BLOCK_SHARE" | "PAUSE";
  safetyMessage: string;
};

export const discoveryResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "ready", "safetyDisposition", "safetyMessage"],
  properties: {
    question: { type: "string", maxLength: 500 },
    ready: { type: "boolean" },
    safetyDisposition: { type: "string", enum: ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"] },
    safetyMessage: { type: "string", maxLength: 1000 },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isDiscoveryResult(
  value: unknown,
  requireQuestion = false,
  turns: readonly DiscoveryTurn[] = [],
): value is DiscoveryResult {
  if (!isRecord(value) || Object.keys(value).length !== 4 ||
    typeof value.question !== "string" || value.question.length > 500 ||
    typeof value.ready !== "boolean" ||
    !["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"].includes(String(value.safetyDisposition)) ||
    typeof value.safetyMessage !== "string" || value.safetyMessage.length > 1000) return false;
  if (requireQuestion && (value.ready || !value.question.trim())) return false;
  if (value.ready === Boolean(value.question.trim())) return false;
  if (turns.length >= maxReflectiveConversationTurns && !value.ready) return false;
  if (!value.ready && isRepeatedConversationQuestion(value.question, turns)) return false;
  if (["BLOCK_SHARE", "PAUSE"].includes(String(value.safetyDisposition)) && !value.ready) return false;
  return value.safetyDisposition === "ALLOW"
    ? value.safetyMessage.trim() === ""
    : value.safetyMessage.trim() !== "";
}

export function generateDiscoveryQuestion(
  env: WorkerEnv,
  input: { sourceText: string; turns: DiscoveryTurn[] },
) {
  const requireQuestion = input.turns.length === 0;
  const atTurnLimit = input.turns.length >= maxReflectiveConversationTurns;
  return requestStructuredOutput(env, {
    schemaName: "shuokai_private_discovery",
    schema: discoveryResultSchema,
    systemText: [
      "你是‘说开’的私人倾听助手。用户还没有选择表达路径；此时只通过对话理解背景，绝不能生成表达卡，也不能推荐或预设非暴力沟通、事实争议、边界声明等路径。",
      "每次最多追问一个会显著影响理解的问题。问题应基于用户刚才说过的话，简短、具体、非诱导；优先澄清含混的指代、具体发生的言行、时间背景、用户真正介意的影响或希望对方理解的重点。不要重复已经回答的问题。",
      "第一次收到原始讲述时必须追问一个具体问题，ready 必须为 false。之后，只有当继续追问不会明显提升表达准确性时，ready 才为 true，question 必须为空字符串；否则 ready 为 false，并给出下一问。",
      `前置倾听与后续表达整理合计最多五轮。${atTurnLimit ? "现已达到五轮，必须令 ready 为 true 且 question 为空。" : "不要为了显得深入而追问；已经回答过的问题不得换标点后重复。"}`,
      "你的职责只到帮助用户说清背景为止。用户选择表达路径后，另一个整理 Agent 只补充该路径特有的信息；不要提前替它生成或填写表达字段。",
      "不要评价谁对谁错，不诊断人格或关系，不推断动机，不把用户的感受改写成事实，不索取姓名、地址、联系方式、账号或诊断等非必要敏感信息。",
      "普通的难过、嫉妒、失望、争吵、关系不安或分手本身不是危险。只有分享可能带来现实危险时使用 WARN；明确的胁迫、暴力、自伤、伤人或迫近危险才使用 BLOCK_SHARE 或 PAUSE。没有真实安全风险时 safetyDisposition 必须为 ALLOW，safetyMessage 必须为空。",
      "只输出中文。",
    ].join("\n"),
    userData: {
      sourceText: input.sourceText,
      privateConversation: input.turns,
    },
    maxTokens: 700,
    validate: (value) => isDiscoveryResult(value, requireQuestion, input.turns),
  });
}
