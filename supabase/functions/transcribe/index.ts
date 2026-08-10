import { createClient } from "@supabase/supabase-js";
import { getSupabaseKeys } from "../_shared/supabase-keys.ts";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ message: "请先登录。" }, 401);

  const { url: supabaseUrl, publishableKey, secretKey } = getSupabaseKeys();
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ message: "语音服务尚未配置。" }, 503);
  }
  const supabase = createClient(
    supabaseUrl,
    publishableKey,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return json({ message: "登录已失效。" }, 401);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return json({ message: "没有收到录音文件。" }, 400);
  }
  if (file.size > 20 * 1024 * 1024) {
    return json({ message: "录音不能超过 20MB。" }, 413);
  }
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const supportedExtensions = new Set(["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]);
  const supportedTypes = new Set([
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "video/mp4",
    "application/octet-stream",
  ]);
  // Browsers commonly append codec parameters, for example
  // `audio/webm;codecs=opus`. Validate the base media type instead.
  const mediaType = file.type.toLowerCase().split(";", 1)[0].trim();
  if (!supportedExtensions.has(extension) || (mediaType && !supportedTypes.has(mediaType))) {
    return json({ message: "当前录音格式不受支持，请改用文字输入。" }, 415);
  }

  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIKey) return json({ message: "语音转写尚未配置。" }, 503);

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: allowed, error: quotaError } = await admin.rpc(
    "internal_reserve_transcription",
    { p_user_id: user.id },
  );
  if (quotaError) return json({ message: "暂时无法确认语音额度，请稍后重试。" }, 503);
  if (!allowed) return json({ message: "本小时转写次数已用完，请稍后再试。" }, 429);

  const openAIForm = new FormData();
  openAIForm.append("file", file, file.name || "recording.mp3");
  openAIForm.append("model", "gpt-4o-mini-transcribe");
  openAIForm.append("language", "zh");

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAIKey}` },
      body: openAIForm,
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    return json({ message: "录音转写暂时不可用，请改用文字输入。" }, 502);
  }
  const result = await response.json().catch(() => ({})) as {
    text?: string;
    error?: { message?: string };
  };
  if (!response.ok || !result.text) {
    return json({ message: "录音转写暂时不可用，请改用文字输入。" }, 502);
  }

  return json({ text: result.text });
});
