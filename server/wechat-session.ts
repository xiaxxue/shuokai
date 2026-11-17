import { createClient } from "@supabase/supabase-js";

export type WechatAuthConfig = { url: string; publishableKey: string; secretKey: string };
export type WechatIdentity = { openid: string; unionid?: string };

type WechatSessionErrorCode =
  | "WECHAT_MAPPING_FAILED" | "USER_SESSION_CREATE_FAILED" | "USER_CREATE_FAILED"
  | "WECHAT_BIND_FAILED" | "LOGIN_TOKEN_CREATE_FAILED" | "LOGIN_SESSION_ISSUE_FAILED"
  | "WECHAT_SESSION_EXPIRED";

export class WechatSessionError extends Error {
  readonly code: WechatSessionErrorCode;
  readonly status: number;
  constructor(code: WechatSessionErrorCode, message: string, status: number) {
    super(message);
    this.name = "WechatSessionError";
    this.code = code;
    this.status = status;
  }
}

function fail(code: WechatSessionErrorCode, message: string, status: number): never {
  throw new WechatSessionError(code, message, status);
}

function publicClient(config: WechatAuthConfig) {
  return createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (item) => item.toString(16).padStart(2, "0")).join("");
}

function authPayload(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string };
}) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    userId: session.user.id,
  };
}

export async function refreshWechatSession(config: WechatAuthConfig, refreshToken: string) {
  const { data, error } = await publicClient(config).auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    fail("WECHAT_SESSION_EXPIRED", "登录已失效，请重新进入小程序。", 401);
  }
  return authPayload({ ...data.session, user: data.user });
}

// The caller must obtain identity from a trusted WeChat server response or SDK context.
// Never pass an openid supplied in the client's request body to this function.
export async function issueWechatSession(config: WechatAuthConfig, identity: WechatIdentity) {
  const admin = createClient(config.url, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const client = publicClient(config);
  const { data: knownUser, error: lookupError } = await admin.rpc(
    "internal_get_wechat_user",
    { p_openid: identity.openid },
  );
  if (lookupError) {
    fail("WECHAT_MAPPING_FAILED", "微信身份映射读取失败。", 500);
  }

  let userId = typeof knownUser === "string" ? knownUser : null;
  let email = "";
  if (userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user?.email) {
      fail("USER_SESSION_CREATE_FAILED", "用户会话创建失败。", 500);
    }
    email = data.user.email;
  } else {
    email = `wx_${(await digest(identity.openid)).slice(0, 32)}@users.shuokai.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { provider: "wechat-mini-program" },
    });
    if (error || !data.user) {
      const { data: racedUser } = await admin.rpc("internal_get_wechat_user", {
        p_openid: identity.openid,
      });
      if (typeof racedUser !== "string") {
        fail("USER_CREATE_FAILED", "用户创建失败。", 500);
      }
      userId = racedUser;
      const { data: racedAccount, error: racedAccountError } = await admin.auth.admin.getUserById(userId);
      if (racedAccountError || !racedAccount.user?.email) {
        fail("USER_SESSION_CREATE_FAILED", "用户会话创建失败。", 500);
      }
      email = racedAccount.user.email;
    } else {
      const createdUserId = data.user.id;
      const { data: boundUser, error: bindError } = await admin.rpc("internal_bind_wechat_user", {
        p_openid: identity.openid,
        p_unionid: identity.unionid ?? "",
        p_user_id: createdUserId,
      });
      if (bindError || typeof boundUser !== "string") {
        await admin.auth.admin.deleteUser(createdUserId);
        fail("WECHAT_BIND_FAILED", "微信身份绑定失败。", 500);
      }
      userId = boundUser;
      if (userId !== createdUserId) {
        await admin.auth.admin.deleteUser(createdUserId);
        const { data: boundAccount, error: boundAccountError } = await admin.auth.admin.getUserById(userId);
        if (boundAccountError || !boundAccount.user?.email) {
          fail("USER_SESSION_CREATE_FAILED", "用户会话创建失败。", 500);
        }
        email = boundAccount.user.email;
      }
    }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    fail("LOGIN_TOKEN_CREATE_FAILED", "登录令牌创建失败。", 500);
  }

  const { data: verified, error: verifyError } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError || !verified.session || !verified.user) {
    fail("LOGIN_SESSION_ISSUE_FAILED", "登录会话签发失败。", 500);
  }
  return authPayload({ ...verified.session, user: verified.user });
}
