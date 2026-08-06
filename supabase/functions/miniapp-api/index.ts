import { createClient } from "@supabase/supabase-js";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const allowedMethods = new Set([
  "create_room",
  "join_room",
  "set_room_goal",
  "save_private_draft",
  "approve_perspective",
  "simulate_partner",
  "propose_agreement",
  "accept_agreement",
  "get_room_snapshot",
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405);
  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ message: "请先登录。" }, 401);

  const { method, args } = await request.json().catch(() => ({ method: "", args: {} }));
  if (!allowedMethods.has(method)) return json({ message: "不支持的操作。" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
  const { data, error } = await supabase.rpc(method, args ?? {});
  if (error) return json({ message: error.message, code: error.code }, 400);
  return json(data);
});
