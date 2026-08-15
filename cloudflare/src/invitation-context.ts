import { requestStructuredOutput } from "./cloudflare-ai.ts";
import type { WorkerEnv } from "./http.ts";

const topicKeys = {
  NVC: "observation",
  FACT_DISPUTE: "claim",
  BOUNDARY: "boundary",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedSentence(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function withTerminalPunctuation(value: string) {
  return /[。！？!?]$/u.test(value) ? value : `${value}。`;
}

const fallbackTitles = {
  NVC: "关于这次具体经历",
  FACT_DISPUTE: "关于一件待核实的事",
  BOUNDARY: "关于需要被尊重的边界",
} as const;

type InvitationSource = {
  mode: keyof typeof topicKeys;
  sourceExcerpt: string;
};

export type InvitationSummary = {
  title: string;
  summary: string;
  generatedByAi: boolean;
};

const invitationSummaryCache = new Map<string, { expiresAt: number; value: InvitationSummary }>();
const invitationSummaryCacheTtlMs = 30 * 60 * 1000;
const invitationSummaryCacheLimit = 200;

async function invitationSummaryCacheKey(source: InvitationSource) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${source.mode}\n${source.sourceExcerpt}`),
  );
  return Array.from(new Uint8Array(bytes), (item) => item.toString(16).padStart(2, "0")).join("");
}

function cacheInvitationSummary(key: string, value: InvitationSummary) {
  if (invitationSummaryCache.size >= invitationSummaryCacheLimit) {
    const oldestKey = invitationSummaryCache.keys().next().value;
    if (typeof oldestKey === "string") invitationSummaryCache.delete(oldestKey);
  }
  invitationSummaryCache.set(key, { expiresAt: Date.now() + invitationSummaryCacheTtlMs, value });
}

export function invitationSourceFromExpression(value: unknown): InvitationSource | null {
  if (!isRecord(value) || typeof value.mode !== "string" || !isRecord(value.payload)) return null;
  const mode = value.mode as keyof typeof topicKeys;
  const key = topicKeys[mode];
  const sourceExcerpt = key ? boundedSentence(value.payload[key], 180) : "";
  return key && sourceExcerpt ? { mode, sourceExcerpt } : null;
}

export function fallbackInvitationSummary(source: InvitationSource | null): InvitationSummary {
  if (!source) {
    return {
      title: "关于这次沟通",
      summary: "发起方想邀请你先了解一件具体发生的事，再从你的视角讲讲当时的情况。",
      generatedByAi: false,
    };
  }
  return {
    title: fallbackTitles[source.mode],
    summary: `发起方确认的背景是：${withTerminalPunctuation(source.sourceExcerpt)}你可以先核对自己记得的时间、地点或场景、人物和经过，再讲你的版本。`,
    generatedByAi: false,
  };
}

function isInvitationSummary(value: unknown): value is Omit<InvitationSummary, "generatedByAi"> {
  if (!isRecord(value) || Object.keys(value).length !== 2) return false;
  const title = value.title;
  const summary = value.summary;
  return typeof title === "string" && title.trim().length >= 4 && title.length <= 32 &&
    typeof summary === "string" && summary.trim().length >= 12 && summary.length <= 220;
}

export async function generateInvitationSummary(
  env: WorkerEnv,
  expression: unknown,
): Promise<InvitationSummary> {
  const source = invitationSourceFromExpression(expression);
  const fallback = fallbackInvitationSummary(source);
  if (!source || !env.AI) return fallback;
  const cacheKey = await invitationSummaryCacheKey(source);
  const cached = invitationSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) invitationSummaryCache.delete(cacheKey);
  try {
    const generated = await requestStructuredOutput(env, {
      schemaName: "shuokai_invitation_summary",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary"],
        properties: {
          title: { type: "string", minLength: 4, maxLength: 32 },
          summary: { type: "string", minLength: 12, maxLength: 220 },
        },
      },
      systemText: [
        "你是‘说开’的邀请说明 Agent。把发起方已经确认的一条事件类表达，整理成受邀方一眼能理解的标题和一段说明。",
        "标题用中性、具体的中文概括这次要谈的事，避免‘关于这次具体经历’这类空标题，也不要判断谁对谁错。",
        "说明优先保留输入中已经出现的时间、地点或场景、人物和事件。输入没有写到的要素直接省略，绝不能猜测地点、关系、动机或事实。",
        "说明只解释邀请背景，不替受邀方下结论，不要求受邀方认错、同意或原谅。不要加入输入中没有出现的感受、需要、请求或诊断。",
        "不要写字段名，不要写‘根据输入’，不要使用 Markdown。输出中文。",
      ].join("\n"),
      userData: source,
      maxTokens: 420,
      validate: isInvitationSummary,
    });
    const result = generated.result as { title: string; summary: string };
    const value = {
      title: boundedSentence(result.title, 32),
      summary: boundedSentence(result.summary, 220),
      generatedByAi: true,
    };
    cacheInvitationSummary(cacheKey, value);
    return value;
  } catch {
    return fallback;
  }
}

export function invitationTopicFromExpression(value: unknown) {
  return invitationSourceFromExpression(value)?.sourceExcerpt ?? "";
}

export function invitationContextFromRecords(snapshot: unknown, expression: unknown) {
  if (!isRecord(snapshot) || !isRecord(snapshot.room) || !isRecord(snapshot.me)) return null;
  if (snapshot.me.role !== "A" && snapshot.me.role !== "B") return null;
  const participants = Array.isArray(snapshot.participants) ? snapshot.participants : [];
  const inviter = participants.find((item) => isRecord(item) && item.role === "A");
  const rawName = isRecord(inviter) ? boundedSentence(inviter.display_name, 60) : "";
  const inviterName = !rawName || rawName === "我" || rawName === "Lin"
    ? "邀请你的人"
    : rawName;
  return {
    inviterName,
    topic: invitationTopicFromExpression(expression),
  };
}
