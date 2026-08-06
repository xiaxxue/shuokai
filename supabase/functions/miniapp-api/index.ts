import { createClient } from "@supabase/supabase-js";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const allowedMethods = new Set([
  "create_room",
  "join_room",
  "set_room_goal",
  "save_private_draft",
  "approve_perspective",
  "get_room_snapshot",
]);

const safeDatabaseMessages: Record<string, string> = {
  "40001": "房间刚刚发生了变化，请刷新后重试。",
  "42501": "你没有执行这个操作的权限。",
  "P0001": "提交的内容不符合当前操作要求。",
  "P0002": "沟通房间不存在或已经失效。",
  "23505": "这个房间已经有另一位参与者。",
  "55000": "当前沟通阶段不能执行这个操作。",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ message: "请先登录。" }, 401);

  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return json({ message: "请求格式无效。" }, 400);
  const { method, args } = payload as { method?: unknown; args?: unknown };
  if (typeof method !== "string") return json({ message: "请求格式无效。" }, 400);
  if (!allowedMethods.has(method)) return json({ message: "不支持的操作。" }, 400);
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return json({ message: "操作参数无效。" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ message: "登录已失效。" }, 401);

  const { data, error } = await supabase.rpc(method, args as Record<string, unknown>);
  if (error) {
    const message = safeDatabaseMessages[error.code] ?? "操作没有完成，请稍后重试。";
    return json({ message, code: error.code }, 400);
  }
  return json(data);
});
