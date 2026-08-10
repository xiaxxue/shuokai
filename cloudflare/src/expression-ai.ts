import { createClient } from "@supabase/supabase-js";
import type { WorkerEnv } from "./http.ts";

export const supportedExpressionModes = ["NVC", "FACT_DISPUTE", "BOUNDARY"] as const;
export type SupportedExpressionMode = typeof supportedExpressionModes[number];

type ClaimPayload = {
  claimed: true;
  jobId: string;
  selectedMode: SupportedExpressionMode;
  sourceText: string;
};

type QueueMessage = { jobId: string };

type QueueMessageEnvelope = {
  body: unknown;
  ack(): void;
  retry(): void;
};

export type QueueBatch = {
  messages: QueueMessageEnvelope[];
};

const fieldSchemas: Record<SupportedExpressionMode, Record<string, unknown>> = {
  NVC: {
    observation: { type: "string", maxLength: 3000 },
    feeling: { type: "string", maxLength: 3000 },
    need: { type: "string", maxLength: 3000 },
    request: { type: "string", maxLength: 3000 },
  },
  FACT_DISPUTE: {
    claim: { type: "string", maxLength: 3000 },
    basis: { type: "string", maxLength: 3000 },
    verificationRequest: { type: "string", maxLength: 3000 },
  },
  BOUNDARY: {
    boundary: { type: "string", maxLength: 3000 },
    reason: { type: "string", maxLength: 3000 },
    acceptableRange: { type: "string", maxLength: 3000 },
    selfProtectiveAction: { type: "string", maxLength: 3000 },
  },
};

export function expressionResultSchema(mode: SupportedExpressionMode) {
  const fields = fieldSchemas[mode];
  return {
    type: "object",
    additionalProperties: false,
    required: ["mode", "fields", "uncertainties", "safetyDisposition", "safetyMessage"],
    properties: {
      mode: { type: "string", enum: [mode] },
      fields: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(fields),
        properties: fields,
      },
      uncertainties: {
        type: "array",
        maxItems: 8,
        items: { type: "string", maxLength: 500 },
      },
      safetyDisposition: {
        type: "string",
        enum: ["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"],
      },
      safetyMessage: { type: "string", maxLength: 1000 },
    },
  };
}

export function isSupportedExpressionMode(value: unknown): value is SupportedExpressionMode {
  return supportedExpressionModes.includes(value as SupportedExpressionMode);
}

export function isExpressionResult(value: unknown, mode: SupportedExpressionMode) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.mode !== mode || !candidate.fields || typeof candidate.fields !== "object" ||
    Array.isArray(candidate.fields) || !Array.isArray(candidate.uncertainties) ||
    !["ALLOW", "WARN", "BLOCK_SHARE", "PAUSE"].includes(String(candidate.safetyDisposition)) ||
    typeof candidate.safetyMessage !== "string" || candidate.safetyMessage.length > 1000) return false;
  const fields = candidate.fields as Record<string, unknown>;
  const expectedFields = Object.keys(fieldSchemas[mode]);
  if (Object.keys(fields).length !== expectedFields.length ||
    expectedFields.some((key) => typeof fields[key] !== "string" || String(fields[key]).length > 3000)) {
    return false;
  }
  return candidate.uncertainties.length <= 8 && candidate.uncertainties.every((item) =>
    typeof item === "string" && item.length <= 500
  );
}

export function parseQueueMessage(value: unknown): QueueMessage | null {
  if (!value || typeof value !== "object") return null;
  if (Object.keys(value).length !== 1 || !("jobId" in value)) return null;
  const jobId = (value as { jobId?: unknown }).jobId;
  return typeof jobId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)
    ? { jobId }
    : null;
}

function adminClient(env: WorkerEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function extractOutputText(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const output = (value as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      if ((part as { type?: unknown }).type === "refusal") throw new Error("AI_REFUSED");
      if ((part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

function modeInstruction(mode: SupportedExpressionMode) {
  if (mode === "NVC") {
    return "按非暴力沟通的观察、感受、需要、请求整理。观察只保留可核实事件；请求必须具体、可拒绝。";
  }
  if (mode === "FACT_DISPUTE") {
    return "保留用户主张、依据和待核实事项。不得裁判真假，不得把推测改写成事实。";
  }
  return "整理清晰边界、可选原因、可接受范围和自我保护行动。边界不需要对方同意才成立。";
}

export async function generateExpressionCandidate(
  env: WorkerEnv,
  input: { mode: SupportedExpressionMode; sourceText: string },
) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_NOT_CONFIGURED");
  const startedAt = Date.now();
  const model = env.OPENAI_TEXT_MODEL ?? "gpt-4o-2024-08-06";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        {
          role: "developer",
          content: [{
            type: "input_text",
            text: [
              "你是‘说开’的表达整理助手。只整理用户已经表达的内容，不补造事实、不诊断任何人、不替用户作决定。",
              modeInstruction(input.mode),
              "uncertainties 只记录无法从原文确认的关键点。发现胁迫、自伤、伤人或明显危险时，用安全字段真实标记；不要把安全提醒塞进分享字段。",
              "输出中文。字段不足时留空，让用户本人补充和确认。",
            ].join("\n"),
          }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: input.sourceText }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: `shuokai_${input.mode.toLowerCase()}_expression`,
          strict: true,
          schema: expressionResultSchema(input.mode),
        },
      },
    }),
    signal: AbortSignal.timeout(45000),
  });
  const providerRequestRef = response.headers.get("x-request-id");
  const body = await response.json().catch(() => null) as {
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  if (!response.ok) throw new Error(response.status === 429 || response.status >= 500
    ? "OPENAI_RETRYABLE"
    : "OPENAI_REQUEST_FAILED");
  const outputText = extractOutputText(body);
  if (!outputText) throw new Error("OPENAI_EMPTY_OUTPUT");
  const result = JSON.parse(outputText) as unknown;
  if (!isExpressionResult(result, input.mode)) {
    throw new Error("OPENAI_INVALID_OUTPUT");
  }
  return {
    model,
    result,
    providerRequestRef,
    tokenInput: body?.usage?.input_tokens ?? null,
    tokenOutput: body?.usage?.output_tokens ?? null,
    latencyMs: Date.now() - startedAt,
  };
}

async function processMessage(env: WorkerEnv, message: QueueMessageEnvelope) {
  const parsed = parseQueueMessage(message.body);
  const admin = adminClient(env);
  if (!parsed || !admin) {
    message.ack();
    return;
  }
  const workerId = crypto.randomUUID();
  const { data: claim, error: claimError } = await admin.rpc("internal_claim_ai_job_v2", {
    p_job_id: parsed.jobId,
    p_worker_id: workerId,
  });
  if (claimError) {
    message.retry();
    return;
  }
  if (!claim || typeof claim !== "object") {
    message.ack();
    return;
  }
  if (!(claim as { claimed?: unknown }).claimed) {
    const status = (claim as { status?: unknown }).status;
    if (status === "QUEUED" || status === "PROCESSING" || status === "FAILED_RETRYABLE") {
      message.retry();
    } else message.ack();
    return;
  }
  const input = claim as ClaimPayload;
  try {
    if (!isSupportedExpressionMode(input.selectedMode) || typeof input.sourceText !== "string") {
      throw new Error("INVALID_JOB_INPUT");
    }
    const generated = await generateExpressionCandidate(env, {
      mode: input.selectedMode,
      sourceText: input.sourceText,
    });
    const { error } = await admin.rpc("internal_complete_ai_job_v2", {
      p_job_id: parsed.jobId,
      p_worker_id: workerId,
      p_model_id: generated.model,
      p_result_payload: generated.result,
      p_provider_request_ref: generated.providerRequestRef,
      p_token_input: generated.tokenInput,
      p_token_output: generated.tokenOutput,
      p_latency_ms: generated.latencyMs,
    });
    if (error) throw new Error("COMPLETE_JOB_FAILED");
    message.ack();
  } catch (error) {
    const code = error instanceof Error ? error.message : "AI_UNKNOWN_ERROR";
    const retryable = code === "OPENAI_RETRYABLE" || code === "COMPLETE_JOB_FAILED";
    await admin.rpc("internal_fail_ai_job_v2", {
      p_job_id: parsed.jobId,
      p_worker_id: workerId,
      p_error_code: code,
      p_retryable: retryable,
    });
    if (retryable) message.retry();
    else message.ack();
  }
}

export async function processExpressionQueue(batch: QueueBatch, env: WorkerEnv) {
  await Promise.all(batch.messages.map((message) => processMessage(env, message)));
}
