import Taro from "@tarojs/taro";
import type { AuthSession } from "../domain/types";

const SESSION_KEY = "shuokai.wechat-session.v1";

export function getSession(): AuthSession | null {
  return Taro.getStorageSync<AuthSession | null>(SESSION_KEY) || null;
}

export function saveSession(session: AuthSession) {
  Taro.setStorageSync(SESSION_KEY, session);
}

export function clearSession() {
  Taro.removeStorageSync(SESSION_KEY);
}
