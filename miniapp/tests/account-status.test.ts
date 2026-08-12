import { describe, expect, it } from "vitest";
import {
  accountPlatformSummary,
  accountStage,
  draftStatusLabel,
  roomPhaseLabel,
  roomRoleLabel,
} from "../src/domain/account-status";

const room = {
  roomId: "11111111-1111-4111-8111-111111111111",
  code: "SAY2026",
  role: "A" as const,
  state: "WAITING_FOR_B" as const,
};

describe("account space status", () => {
  it("reports the real auth platform instead of offering a fake cross-platform logout", () => {
    expect(accountPlatformSummary("h5", "person@example.test")).toMatchObject({
      identity: "person@example.test",
      loginStatus: "Supabase 会话已登录",
    });
    expect(accountPlatformSummary("mp-weixin", "")).toMatchObject({
      identity: "微信平台账号",
      loginStatus: "微信会话已连接",
    });
    expect(accountPlatformSummary("mp-weixin", "").platformNote).toContain("没有可退出的 Supabase 邮箱会话");
  });

  it("shows the saved room phase even while the welcome screen is visible", () => {
    expect(accountStage("WELCOME", room)).toBe("INVITE");
    expect(roomPhaseLabel("WELCOME", room)).toBe("等待对方加入或确认");
    expect(roomRoleLabel(room)).toBe("发起者");
  });

  it("keeps the more precise visible editor stage", () => {
    expect(accountStage("NVC_NEED", { ...room, state: "A_DRAFTING" })).toBe("NVC_NEED");
    expect(roomPhaseLabel("NVC_NEED", { ...room, state: "A_DRAFTING" })).toBe("非暴力沟通 · 需要");
  });

  it("shows truthful v2 pause and unfinished joint-generation states", () => {
    expect(roomPhaseLabel("WELCOME", {
      ...room,
      workflowVersion: 2,
      state: "A_DRAFTING",
      phaseV2: "PRIVATE_EXPRESSION",
    })).toBe("私人对话中");
    expect(roomPhaseLabel("WELCOME", {
      ...room,
      workflowVersion: 2,
      phaseV2: "PAUSED",
    })).toBe("本次沟通已暂停");
    expect(roomPhaseLabel("WELCOME", {
      ...room,
      workflowVersion: 2,
      state: "COMMON_VIEW_READY",
      phaseV2: "UNDERSTANDING_GENERATING",
    })).toBe("双方表达已确认 · 共同理解待接入");
  });

  it("describes local and synced draft states without exposing storage details", () => {
    expect(draftStatusLabel(room, "saving", false)).toBe("正在保存到此设备");
    expect(draftStatusLabel(room, "saved", false)).toBe("已保存到此设备");
    expect(draftStatusLabel(room, "empty", true)).toBe("已保存到私人空间");
    expect(draftStatusLabel(null, "saved", true)).toBe("暂无私人草稿");
  });
});
