import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthSession } from "../domain/types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type H5AuthResult = {
  session: AuthSession | null;
  email: string;
  confirmationRequired: boolean;
};

const uniStorage = {
  getItem(key: string) {
    const value: unknown = uni.getStorageSync(key);
    return typeof value === "string" ? value : null;
  },
  setItem(key: string, value: string) {
    uni.setStorageSync(key, value);
  },
  removeItem(key: string) {
    uni.removeStorageSync(key);
  },
};

let h5Client: SupabaseClient | null = null;

function requireH5Configuration() {
  if (__PLATFORM__ !== "h5") {
    throw new Error("邮箱登录仅在 H5 客户端可用。");
  }
  if (!__SUPABASE_URL__ || !__SUPABASE_PUBLISHABLE_KEY__) {
    throw new Error("网页登录尚未配置 Supabase URL 与 publishable key。");
  }
}

export function getH5SupabaseClient() {
  requireH5Configuration();
  if (!h5Client) {
    h5Client = createClient(__SUPABASE_URL__, __SUPABASE_PUBLISHABLE_KEY__, {
      auth: {
        storage: uniStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return h5Client;
}

function toAuthSession(session: Session): AuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    userId: session.user.id,
  };
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!emailPattern.test(normalized) || normalized.length > 254) {
    throw new Error("请输入有效的邮箱地址。");
  }
  return normalized;
}

function validatePassword(password: string) {
  if (password.length < 8 || password.length > 72) {
    throw new Error("密码长度需要在 8 到 72 个字符之间。");
  }
  return password;
}

function authResult(session: Session | null, email: string, confirmationRequired = false): H5AuthResult {
  return {
    session: session ? toAuthSession(session) : null,
    email,
    confirmationRequired,
  };
}

export async function restoreH5Auth(): Promise<H5AuthResult> {
  const client = getH5SupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error("无法恢复登录状态，请重新登录。");
  return authResult(data.session, data.session?.user.email ?? "");
}

export async function requireH5Session(): Promise<AuthSession> {
  const restored = await restoreH5Auth();
  if (!restored.session) throw new Error("请先注册或登录，再开始沟通。");
  return restored.session;
}

export async function signInH5(email: string, password: string): Promise<H5AuthResult> {
  const normalizedEmail = normalizeEmail(email);
  const client = getH5SupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizedEmail,
    password: validatePassword(password),
  });
  if (error || !data.session) {
    throw new Error("登录失败，请检查邮箱、密码和邮箱确认状态。");
  }
  return authResult(data.session, data.user.email ?? normalizedEmail);
}

export async function signUpH5(email: string, password: string): Promise<H5AuthResult> {
  const normalizedEmail = normalizeEmail(email);
  const redirectTo = typeof location === "undefined"
    ? undefined
    : `${location.origin}${location.pathname}`;
  const client = getH5SupabaseClient();
  const { data, error } = await client.auth.signUp({
    email: normalizedEmail,
    password: validatePassword(password),
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  if (error || !data.user) throw new Error("注册失败，请稍后重试或更换邮箱。");
  return authResult(data.session, data.user.email ?? normalizedEmail, !data.session);
}

export async function signOutH5() {
  const client = getH5SupabaseClient();
  const { data } = await client.auth.getSession();
  if (!data.session) return;
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error("退出失败，请稍后重试。");
}
