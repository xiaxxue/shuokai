import type { AuthSession } from "../domain/types";

const SESSION_KEY = "shuokai.session.v2";

export function getSession(): AuthSession | null {
  return (uni.getStorageSync(SESSION_KEY) as AuthSession | null) || null;
}

export function saveSession(session: AuthSession) {
  uni.setStorageSync(SESSION_KEY, session);
}

export function clearSession() {
  uni.removeStorageSync(SESSION_KEY);
}
