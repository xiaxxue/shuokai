import { createClient } from "@supabase/supabase-js";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ message: "请先登录。" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !serviceKey) {
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
  const extension = file.name.toLowerCase().split(".").pop();
  const supportedTypes = new Set(["audio/mpeg", "audio/mp3", "application/octet-stream"]);
  if (extension !== "mp3" || (file.type && !supportedTypes.has(file.type))) {
    return json({ message: "目前只支持 MP3 录音。" }, 415);
  }

  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIKey) return json({ message: "语音转写尚未配置。" }, 503);

  const admin = createClient(supabaseUrl, serviceKey, {
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
