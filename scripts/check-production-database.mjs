const REQUIRED_CONTEXT_FUNCTIONS = [
  "get_ai_memory_context_v3",
  "get_room_relationship_context_v3",
];

export async function checkProductionDatabase({ supabaseUrl, supabasePublishableKey, request = fetch }) {
  for (const name of REQUIRED_CONTEXT_FUNCTIONS) {
    let response;
    let result;
    try {
      // An anonymous request must reach the existing function and be denied by
      // its EXECUTE privilege. No user account or real room is needed.
      response = await request(`${supabaseUrl}/rest/v1/rpc/${name}`, {
        method: "POST",
        redirect: "error",
        headers: { apikey: supabasePublishableKey, "content-type": "application/json" },
        body: JSON.stringify({ p_room_id: "00000000-0000-4000-8000-000000000000" }),
        signal: AbortSignal.timeout(10_000),
      });
      result = await response.json();
    } catch {
      throw new Error(`无法检查正式数据库函数 ${name}；发布已停止，请检查数据库连接。`);
    }
    if (result?.code === "PGRST202") {
      throw new Error(`正式数据库缺少 ${name} 或 API schema cache 未更新；请先应用主分支 migration，拒绝发布不匹配的后端。`);
    }
    if (![401, 403].includes(response.status) || result?.code !== "42501" ||
        result?.message !== `permission denied for function ${name}`) {
      throw new Error(`正式数据库函数 ${name} 的存在性和匿名隔离未通过检查；发布已停止。`);
    }
  }
}
