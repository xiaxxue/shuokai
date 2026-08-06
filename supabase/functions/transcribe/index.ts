import { createClient } from "@supabase/supabase-js";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ message: "请先登录。" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
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

  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAIKey) return json({ message: "语音转写尚未配置。" }, 503);

  const openAIForm = new FormData();
  openAIForm.append("file", file, file.name || "recording.mp3");
  openAIForm.append("model", "gpt-4o-mini-transcribe");
  openAIForm.append("language", String(form.get("language") || "zh"));

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAIKey}` },
    body: openAIForm,
  });
  const result = await response.json() as { text?: string; error?: { message?: string } };
  if (!response.ok || !result.text) {
    return json({ message: "录音转写暂时不可用，请改用文字输入。" }, 502);
  }

  return json({ text: result.text });
});
