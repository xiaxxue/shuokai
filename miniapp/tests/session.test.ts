import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, unknown>();
const login = vi.fn();
const request = vi.fn();

vi.stubGlobal("uni", {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
  login,
  request,
});

import { loginForPlatform } from "../src/services/api";
import { clearActiveRoom, getActiveRoom, saveActiveRoom } from "../src/services/session";

const sessionKey = "shuokai.session.v2";
const freshSession = {
  accessToken: "fresh-access",
  refreshToken: "fresh-refresh",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  userId: "00000000-0000-4000-8000-000000000002",
};

function loginSucceeds(code: string) {
  login.mockImplementation(({ success }: { success: (result: { code: string }) => void }) => {
    success({ code });
  });
}

function requestReturns(statusCode: number, data: unknown) {
  return ({ success }: { success: (result: { statusCode: number; data: unknown }) => void }) => {
    success({ statusCode, data });
  };
}

describe("wechat session recovery", () => {
  beforeEach(() => {
    storage.clear();
    login.mockReset();
    request.mockReset();
  });

  it("clears an expired refresh token and creates a new WeChat session", async () => {
    storage.set(sessionKey, {
      ...freshSession,
      accessToken: "expired-access",
      refreshToken: "expired-refresh",
      expiresAt: 1,
    });
    request
      .mockImplementationOnce(requestReturns(401, { message: "expired" }))
      .mockImplementationOnce(requestReturns(200, freshSession));
    loginSucceeds("one-time-code");

    await expect(loginForPlatform()).resolves.toEqual(freshSession);
    expect(login).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(storage.get(sessionKey)).toEqual(freshSession);
  });

  it("deduplicates concurrent login requests", async () => {
    loginSucceeds("one-time-code");
    request.mockImplementation(requestReturns(200, freshSession));

    const first = loginForPlatform();
    const second = loginForPlatform();

    await expect(Promise.all([first, second])).resolves.toEqual([freshSession, freshSession]);
    expect(login).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("active room recovery", () => {
  beforeEach(() => storage.clear());

  it("persists and clears the room needed to resume a mobile flow", () => {
    const room = {
      roomId: "11111111-1111-4111-8111-111111111111",
      code: "SAY2026",
      role: "A" as const,
      state: "WAITING_FOR_B" as const,
    };

    expect(getActiveRoom()).toBeNull();
    saveActiveRoom(room);
    expect(getActiveRoom()).toEqual(room);
    clearActiveRoom();
    expect(getActiveRoom()).toBeNull();
  });

  it("ignores malformed room data from local storage", () => {
    storage.set("shuokai.active-room.v1", {
      roomId: "not-a-complete-room",
      code: "SAY2026",
      role: "A",
      state: "UNKNOWN_STATE",
    });

    expect(getActiveRoom()).toBeNull();
  });
});
