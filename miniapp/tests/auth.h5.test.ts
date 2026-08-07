import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: mocks }),
}));

const storage = new Map<string, unknown>();
vi.stubGlobal("uni", {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
});
vi.stubGlobal("location", {
  origin: "https://h5.example.test",
  pathname: "/app/",
});

import { restoreH5Auth, signInH5, signOutH5, signUpH5 } from "../src/services/auth";

const session = {
  access_token: "signed-access-token",
  refresh_token: "rotating-refresh-token",
  expires_at: 1_800_000_000,
  user: { id: "10000000-0000-4000-8000-000000000001", email: "user@example.test" },
};

describe("H5 Supabase authentication", () => {
  beforeEach(() => {
    storage.clear();
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("signs in with normalized email and returns the persisted session shape", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { session, user: session.user }, error: null });

    await expect(signInH5(" User@Example.Test ", "password123")).resolves.toEqual({
      session: {
        accessToken: "signed-access-token",
        refreshToken: "rotating-refresh-token",
        expiresAt: 1_800_000_000,
        userId: session.user.id,
      },
      email: "user@example.test",
      confirmationRequired: false,
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.test",
      password: "password123",
    });
  });

  it("reports email confirmation when registration does not create a session", async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: null, user: session.user },
      error: null,
    });

    await expect(signUpH5("user@example.test", "password123")).resolves.toMatchObject({
      session: null,
      email: "user@example.test",
      confirmationRequired: true,
    });
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "user@example.test",
      password: "password123",
      options: { emailRedirectTo: "https://h5.example.test/app/" },
    });
  });

  it("restores and locally signs out an existing session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });

    await expect(restoreH5Auth()).resolves.toMatchObject({
      session: { userId: session.user.id },
      email: "user@example.test",
    });
    await expect(signOutH5()).resolves.toBeUndefined();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("rejects weak passwords before calling Supabase", async () => {
    await expect(signInH5("user@example.test", "short")).rejects.toThrow("8 到 72");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});
