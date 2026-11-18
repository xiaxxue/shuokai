import type { WorkerEnv } from "./http.ts";

export const OPENCODE_TEXT_MODEL = "deepseek-v4.1-flash";
export const OPENCODE_BASE_URL = "https://opencode.ai/inference/openai/v1";

export async function requestOpenCodeOutput(
  env: WorkerEnv,
  input: {
    messages: Array<{ role: string; content: string }>;
    schemaName: string;
    schema: Record<string, unknown>;
    maxTokens: number;
  },
) {
  if (!env.OPENCODE_API_KEY?.trim()) throw new Error("OPENCODE_AI_NOT_CONFIGURED");
  let response: Response;
  try {
    response = await fetch(`${OPENCODE_BASE_URL}/chat/completions`, {
      method: "POST",
      // Workers only supports follow/manual. Reject redirects via response.ok
      // below so the provider credential is never forwarded to a second URL.
      redirect: "manual",
      headers: {
        authorization: `Bearer ${env.OPENCODE_API_KEY.trim()}`,
        "content-type": "application/json",
        "user-agent": "shuokai/0.2",
      },
      body: JSON.stringify({
        model: OPENCODE_TEXT_MODEL,
        messages: input.messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: input.schemaName, strict: true, schema: input.schema },
        },
        max_tokens: input.maxTokens,
        temperature: 0.1,
        thinking: { type: "disabled" },
      }),
      // Private discovery can make three validation attempts within a 60s cloud call.
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("OPENCODE_AI_RETRYABLE");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(response.status === 429 || response.status >= 500
      ? "OPENCODE_AI_RETRYABLE"
      : "OPENCODE_AI_REQUEST_FAILED");
  }
  try {
    const value: unknown = await response.json();
    // Do not use private reasoning as product output.
    const record = value as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    const content = record?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
      throw new Error("OPENCODE_AI_RETRYABLE");
    }
    throw new Error("OPENCODE_AI_INVALID_OUTPUT");
  }
}
