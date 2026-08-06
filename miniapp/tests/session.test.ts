import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  login: vi.fn(),
  request: vi.fn(),
}));

vi.mock("@tarojs/taro", () => ({
  default: {
    getStorageSync: (key: string) => mocks.storage.get(key),
    setStorageSync: (key: string, value: unknown) => mocks.storage.set(key, value),
    removeStorageSync: (key: string) => mocks.storage.delete(key),
    login: mocks.login,
    request: mocks.request,
  },
}));

import { loginWithWechat } from "../src/services/api";

const sessionKey = "shuokai.wechat-session.v1";
const freshSession = {
  accessToken: "fresh-access",
  refreshToken: "fresh-refresh",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  userId: "00000000-0000-4000-8000-000000000002",
};

describe("wechat session recovery", () => {
  beforeEach(() => {
    mocks.storage.clear();
    mocks.login.mockReset();
    mocks.request.mockReset();
  });

  it("clears an expired refresh token and creates a new WeChat session", async () => {
    mocks.storage.set(sessionKey, {
      ...freshSession,
      accessToken: "expired-access",
      refreshToken: "expired-refresh",
      expiresAt: 1,
    });
    mocks.request
      .mockResolvedValueOnce({ statusCode: 401, data: { message: "expired" } })
      .mockResolvedValueOnce({ statusCode: 200, data: freshSession });
    mocks.login.mockResolvedValue({ code: "one-time-code" });

    await expect(loginWithWechat()).resolves.toEqual(freshSession);
    expect(mocks.login).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.storage.get(sessionKey)).toEqual(freshSession);
  });

  it("deduplicates concurrent login requests", async () => {
    mocks.login.mockResolvedValue({ code: "one-time-code" });
    mocks.request.mockResolvedValue({ statusCode: 200, data: freshSession });

    const first = loginWithWechat();
    const second = loginWithWechat();

    await expect(Promise.all([first, second])).resolves.toEqual([freshSession, freshSession]);
    expect(mocks.login).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});
