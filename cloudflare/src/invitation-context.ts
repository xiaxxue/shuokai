import { requestStructuredOutput } from "./cloudflare-ai.ts";
import type { WorkerEnv } from "./http.ts";

const topicKeys = {
  NVC: "observation",
  FACT_DISPUTE: "claim",
  BOUNDARY: "boundary",
} as const;

const sourceFieldByMode = {
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
  sourceField: typeof sourceFieldByMode[keyof typeof sourceFieldByMode];
  sourceExcerpt: string;
};

type InvitationDraftContext = {
  people: string[];
  time: string | null;
  place: string | null;
  event: string;
  whyInvite: string;
};

export type InvitationDraft = {
  ready: boolean;
  title: string;
  summary: string;
  context: InvitationDraftContext;
  missingFacts: Array<"people" | "time" | "place" | "event">;
  sourceField: InvitationSource["sourceField"];
  sourceHash: string;
  generatedByAi: boolean;
};

export type InvitationDraftGeneration = {
  draft: InvitationDraft;
  model: string | null;
  providerRequestRef: string | null;
  tokenInput: number;
  tokenOutput: number;
  latencyMs: number;
};

export function pendingInvitationDraft(
  mode: keyof typeof sourceFieldByMode,
): InvitationDraft {
  return {
    ready: false,
    title: "",
    summary: "",
    context: { people: [], time: null, place: null, event: "", whyInvite: "" },
    missingFacts: ["people", "time", "place", "event"],
    sourceField: sourceFieldByMode[mode],
    sourceHash: "",
    generatedByAi: false,
  };
}

async function invitationSourceHash(source: InvitationSource) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${source.mode}\n${source.sourceExcerpt}`),
  );
  return Array.from(new Uint8Array(bytes), (item) => item.toString(16).padStart(2, "0")).join("");
}

export function invitationSourceFromExpression(value: unknown): InvitationSource | null {
  if (!isRecord(value) || typeof value.mode !== "string" || !isRecord(value.payload)) return null;
  const mode = value.mode as keyof typeof topicKeys;
  const key = topicKeys[mode];
  const sourceExcerpt = key ? boundedSentence(value.payload[key], 3000) : "";
  return key && sourceExcerpt ? { mode, sourceField: sourceFieldByMode[mode], sourceExcerpt } : null;
}

export async function fallbackInvitationDraft(source: InvitationSource | null): Promise<InvitationDraft> {
  if (!source) {
    return {
      ready: false,
      title: "关于这次沟通",
      summary: "发起方想邀请你先了解一件具体发生的事，再从你的视角讲讲当时的情况。",
      context: {
        people: [],
        time: null,
        place: null,
        event: "",
        whyInvite: "邀请对方讲讲自己记得的情况",
      },
      missingFacts: ["people", "time", "place", "event"],
      sourceField: "observation",
      sourceHash: "",
      generatedByAi: false,
    };
  }
  const previewExcerpt = boundedSentence(source.sourceExcerpt, 190);
  return {
    ready: true,
    title: fallbackTitles[source.mode],
    summary: boundedSentence(
      `发起方确认的背景是：${withTerminalPunctuation(previewExcerpt)}这份邀请希望你也讲讲自己记得的情况和期待。`,
      300,
    ),
    context: {
      people: [],
      time: null,
      place: null,
      event: boundedSentence(source.sourceExcerpt, 300),
      whyInvite: "邀请对方讲讲自己记得的情况和期待",
    },
    missingFacts: ["people", "time", "place"],
    sourceField: source.sourceField,
    sourceHash: await invitationSourceHash(source),
    generatedByAi: false,
  };
}

function isNullableBoundedText(value: unknown, maxLength: number) {
  return value === null || typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isInvitationDraftResult(value: unknown) {
  if (!isRecord(value) || Object.keys(value).length !== 6 || !isRecord(value.context)) return false;
  const title = value.title;
  const summary = value.summary;
  const context = value.context;
  const missingFacts = value.missingFacts;
  return value.ready === true && typeof title === "string" && title.trim().length >= 4 && title.length <= 40 &&
    typeof summary === "string" && summary.trim().length >= 20 && summary.length <= 300 &&
    Object.keys(context).length === 5 && Array.isArray(context.people) && context.people.length <= 6 &&
    context.people.every((item) => typeof item === "string" && item.trim() && item.length <= 40) &&
    isNullableBoundedText(context.time, 80) && isNullableBoundedText(context.place, 80) &&
    typeof context.event === "string" && context.event.trim().length > 0 && context.event.length <= 300 &&
    typeof context.whyInvite === "string" && context.whyInvite.trim().length > 0 &&
    context.whyInvite.length <= 180 && Array.isArray(missingFacts) && missingFacts.length <= 4 &&
    missingFacts.every((item) => ["people", "time", "place", "event"].includes(String(item))) &&
    Object.values(sourceFieldByMode).includes(value.sourceField as InvitationSource["sourceField"]);
}

export async function generateInvitationDraft(
  env: WorkerEnv,
  expression: unknown,
): Promise<InvitationDraftGeneration> {
  const source = invitationSourceFromExpression(expression);
  const fallback = await fallbackInvitationDraft(source);
  if (!source || !env.AI) {
    return {
      draft: fallback,
      model: null,
      providerRequestRef: null,
      tokenInput: 0,
      tokenOutput: 0,
      latencyMs: 0,
    };
  }
  try {
    const generated = await requestStructuredOutput(env, {
      schemaName: "shuokai_invitation_draft_v1",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ready", "title", "summary", "context", "missingFacts", "sourceField"],
        properties: {
          ready: { type: "boolean", enum: [true] },
          title: { type: "string", minLength: 4, maxLength: 40 },
          summary: { type: "string", minLength: 20, maxLength: 300 },
          context: {
            type: "object",
            additionalProperties: false,
            required: ["people", "time", "place", "event", "whyInvite"],
            properties: {
              people: { type: "array", maxItems: 6, items: { type: "string", maxLength: 40 } },
              time: { type: ["string", "null"], maxLength: 80 },
              place: { type: ["string", "null"], maxLength: 80 },
              event: { type: "string", minLength: 1, maxLength: 300 },
              whyInvite: { type: "string", minLength: 1, maxLength: 180 },
            },
          },
          missingFacts: {
            type: "array",
            maxItems: 4,
            items: { type: "string", enum: ["people", "time", "place", "event"] },
          },
          sourceField: { type: "string", enum: [source.sourceField] },
        },
      },
      systemText: [
        "你是‘说开’的邀请说明 Agent。把发起方已经确认的一条事件类表达，整理成受邀方一眼能理解的标题和一段说明。",
        "标题用中性、具体的中文概括这次要谈的事，避免‘关于这次具体经历’这类空标题，也不要判断谁对谁错。",
        "说明要交代输入中已经出现的人物、时间、地点或场景和事件，再用一句话说明：邀请对方也讲讲自己记得的情况、感受或期待。",
        "输入没有写到的事实直接省略，并在 missingFacts 标记；绝不能猜测地点、关系、动机或事实。",
        "context 用于检查摘要是否完整，只能从输入抽取；whyInvite 可以使用系统给定的中性邀请目的。",
        "说明只解释邀请背景，不替受邀方下结论，不要求受邀方认错、同意或原谅。不要加入输入中没有出现的诊断。",
        "不要写字段名，不要写‘根据输入’，不要使用 Markdown。输出中文。",
      ].join("\n"),
      userData: source,
      maxTokens: 760,
      validate: isInvitationDraftResult,
    });
    const result = generated.result as Omit<InvitationDraft, "sourceHash" | "generatedByAi">;
    return {
      draft: {
        ...result,
        title: boundedSentence(result.title, 40),
        summary: boundedSentence(result.summary, 300),
        sourceHash: await invitationSourceHash(source),
        generatedByAi: true,
      },
      model: generated.model,
      providerRequestRef: generated.providerRequestRef,
      tokenInput: generated.tokenInput,
      tokenOutput: generated.tokenOutput,
      latencyMs: generated.latencyMs,
    };
  } catch {
    return {
      draft: fallback,
      model: null,
      providerRequestRef: null,
      tokenInput: 0,
      tokenOutput: 0,
      latencyMs: 0,
    };
  }
}

export function invitationTopicFromExpression(value: unknown) {
  return boundedSentence(invitationSourceFromExpression(value)?.sourceExcerpt, 180);
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
  const record = isRecord(expression) ? expression : null;
  const title = boundedSentence(record?.invitation_title, 40);
  const summary = boundedSentence(record?.invitation_summary, 300);
  return {
    inviterName,
    topic: invitationTopicFromExpression(expression),
    title,
    summary,
    confirmedSummary: Boolean(title && summary),
  };
}
