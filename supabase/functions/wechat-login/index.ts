import { createClient } from "@supabase/supabase-js";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (item) => item.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const appId = Deno.env.get("WECHAT_APP_ID");
  const appSecret = Deno.env.get("WECHAT_APP_SECRET");
  if (!appId || !appSecret) return json({ message: "微信登录尚未配置。" }, 503);

  const { code, refreshToken } = await request.json().catch(() => ({ code: "", refreshToken: "" }));
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (refreshToken) {
    const { data: refreshed, error: refreshError } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (refreshError || !refreshed.session || !refreshed.user) {
      return json({ message: "登录已失效，请重新进入小程序。" }, 401);
    }
    return json({
      accessToken: refreshed.session.access_token,
      refreshToken: refreshed.session.refresh_token,
      expiresAt: refreshed.session.expires_at,
      userId: refreshed.user.id,
    });
  }

  if (!code) return json({ message: "缺少微信登录凭证。" }, 400);

  const authResponse = await fetch(
    `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`,
  );
  const identity = await authResponse.json() as {
    openid?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (!authResponse.ok || !identity.openid || identity.errcode) {
    return json({ message: "微信身份校验失败，请重新进入小程序。" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: knownUser, error: lookupError } = await admin.rpc(
    "internal_get_wechat_user",
    { p_openid: identity.openid },
  );
  if (lookupError) return json({ message: "微信身份映射读取失败。" }, 500);

  let userId = knownUser as string | null;
  let email = "";
  if (userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user?.email) return json({ message: "用户会话创建失败。" }, 500);
    email = data.user.email;
  } else {
    email = `wx_${(await digest(identity.openid)).slice(0, 32)}@users.shuokai.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provider: "wechat-mini-program" },
    });
    if (error || !data.user) return json({ message: "用户创建失败。" }, 500);
    userId = data.user.id;
    const { error: bindError } = await admin.rpc("internal_bind_wechat_user", {
      p_openid: identity.openid,
      p_unionid: identity.unionid ?? "",
      p_user_id: userId,
    });
    if (bindError) return json({ message: "微信身份绑定失败。" }, 500);
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return json({ message: "登录令牌创建失败。" }, 500);

  const { data: verified, error: verifyError } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError || !verified.session || !verified.user) {
    return json({ message: "登录会话签发失败。" }, 500);
  }

  return json({
    accessToken: verified.session.access_token,
    refreshToken: verified.session.refresh_token,
    expiresAt: verified.session.expires_at,
    userId: verified.user.id,
  });
});
