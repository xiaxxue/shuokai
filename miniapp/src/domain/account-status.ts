import type { ClientStage } from "./room-state";
import { stageForRoom } from "./room-state";
import type { RoomSession } from "./types";

const stageLabels: Record<ClientStage, string> = {
  WELCOME: "准备开始",
  GOAL: "确认沟通意图",
  RECORD: "整理自己的表达",
  CLARIFY: "抓住最重要的一点",
  REVIEW: "确认准备分享的内容",
  INVITE: "等待对方加入或确认",
  COMMON: "查看双方共同视图",
  AGREEMENT: "确认 7 天小实验",
  COMPLETE: "本次沟通已完成",
};

export type DraftSaveState = "empty" | "saving" | "saved";

export function accountPlatformSummary(platform: string, email: string) {
  if (platform === "h5") {
    return {
      identity: email || "邮箱账号",
      platformLabel: "H5 邮箱账号",
      loginStatus: "Supabase 会话已登录",
      platformNote: "",
    };
  }
  if (platform === "mp-weixin") {
    return {
      identity: "微信平台账号",
      platformLabel: "微信小程序账号",
      loginStatus: "微信会话已连接",
      platformNote: "此处使用微信平台会话自动连接说开服务，当前版本没有可退出的 Supabase 邮箱会话。",
    };
  }
  return {
    identity: "平台账号",
    platformLabel: "跨端客户端账号",
    loginStatus: "真实会话已连接",
    platformNote: "当前平台使用真实测试环境会话。",
  };
}

export function accountStage(stage: ClientStage, room: RoomSession | null): ClientStage {
  if (!room || stage !== "WELCOME") return stage;
  return stageForRoom(room.role, room.state);
}

export function roomPhaseLabel(stage: ClientStage, room: RoomSession | null) {
  if (!room) return "暂无进行中的沟通";
  return stageLabels[accountStage(stage, room)];
}

export function roomRoleLabel(room: RoomSession | null) {
  if (!room) return "尚未加入房间";
  return room.role === "A" ? "发起者" : "受邀者";
}

export function draftStatusLabel(
  room: RoomSession | null,
  saveState: DraftSaveState,
  hasSyncedPrivateDraft: boolean,
) {
  if (!room) return "暂无私人草稿";
  if (saveState === "saving") return "正在保存到此设备";
  if (saveState === "saved") return "已保存到此设备";
  if (hasSyncedPrivateDraft) return "已保存到私人空间";
  return "尚未保存私人草稿";
}
