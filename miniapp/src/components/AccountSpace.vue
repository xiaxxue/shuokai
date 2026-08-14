<template>
  <view v-if="open" class="account-layer" role="dialog" aria-label="我的空间">
    <view class="account-backdrop" @tap="$emit('close')" />
    <view class="account-sheet" @tap.stop>
      <view class="sheet-handle" />
      <view class="sheet-heading">
        <view>
          <text class="account-kicker">只属于你的这一侧</text>
          <text class="account-title">我的空间</text>
        </view>
        <button class="sheet-close" aria-label="关闭我的空间" @tap="$emit('close')">×</button>
      </view>

      <view class="identity-card">
        <view class="identity-seal"><text>{{ identityMark }}</text></view>
        <view class="identity-copy">
          <text class="identity-label">{{ platformLabel }}</text>
          <text class="identity-value">{{ identity }}</text>
          <view class="status-line"><text class="status-dot" /><text>{{ loginStatus }}</text></view>
        </view>
      </view>

      <view class="space-section">
        <view class="section-heading">
          <text>当前沟通</text>
          <text v-if="roomCode" class="room-code">{{ roomCode }}</text>
        </view>
        <view class="status-row">
          <text class="status-key">所处阶段</text>
          <text class="status-value">{{ roomPhase }}</text>
        </view>
        <view class="status-row">
          <text class="status-key">我的身份</text>
          <text class="status-value">{{ roomRole }}</text>
        </view>
        <view class="status-row">
          <text class="status-key">草稿状态</text>
          <view class="draft-value">
            <text class="draft-lock">私</text>
            <text class="status-value">{{ draftStatus }}</text>
          </view>
        </view>
        <text class="privacy-copy">私人草稿不会进入共同视图，只有你确认分享的内容对对方可见。</text>
      </view>

      <RoomHistoryList
        :items="historyItems"
        :current-room-id="currentRoomId"
        :loading="historyLoading"
        :error="historyError"
        :has-more="historyHasMore"
        @refresh="$emit('refresh-history')"
        @load-more="$emit('load-more-history')"
        @open-room="$emit('open-history', $event)"
      />

      <view v-if="canSignOut" class="account-actions">
        <button class="signout-button" :disabled="busy" @tap="$emit('signout')">
          <text>退出当前设备</text><text class="action-arrow">→</text>
        </button>
        <text class="action-note">退出后将清除这台设备保存的房间入口与私人草稿，其他设备保持登录。</text>
      </view>
      <view v-else class="platform-note">
        <text class="platform-note-title">当前平台不提供账号退出</text>
        <text>{{ platformNote }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RoomHistoryItem } from "../domain/room-history";
import RoomHistoryList from "./RoomHistoryList.vue";

const props = defineProps<{
  open: boolean;
  platformLabel: string;
  identity: string;
  loginStatus: string;
  roomCode: string;
  roomPhase: string;
  roomRole: string;
  draftStatus: string;
  canSignOut: boolean;
  platformNote: string;
  currentRoomId: string;
  historyItems: RoomHistoryItem[];
  historyLoading: boolean;
  historyError: string;
  historyHasMore: boolean;
  busy?: boolean;
}>();

defineEmits<{
  close: [];
  signout: [];
  "refresh-history": [];
  "load-more-history": [];
  "open-history": [item: RoomHistoryItem];
}>();

const identityMark = computed(() => {
  const value = props.identity.trim();
  if (!value) return "我";
  if (value.includes("@")) return value.slice(0, 1).toUpperCase();
  return value.slice(0, 1);
});
</script>

<style scoped lang="scss">
$paper: #f3efe6;
$surface: #fffdf8;
$ink: #1c2923;
$muted: #68726c;
$line: #d8d3c8;
$coral: #df5b3f;
$green: #315b47;
$sage: #dfe9dc;

.account-layer {
  position: fixed;
  z-index: 80;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.account-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(22, 32, 27, .46);
  backdrop-filter: blur(3px);
}

.account-sheet {
  position: relative;
  width: 100%;
  max-width: 560px;
  max-height: calc(100vh - 34px);
  max-height: calc(100dvh - 34px);
  padding: 11px 22px calc(24px + env(safe-area-inset-bottom));
  overflow-y: auto;
  border-radius: 26px 26px 0 0;
  background:
    radial-gradient(circle at 90% 7%, rgba(223, 91, 63, .12), transparent 31%),
    $paper;
  box-sizing: border-box;
  box-shadow: 0 -18px 55px rgba(19, 31, 25, .18);
  animation: account-rise .24s ease-out both;
}

@keyframes account-rise {
  from { opacity: 0; transform: translateY(28px); }
  to { opacity: 1; transform: translateY(0); }
}

.sheet-handle {
  width: 42px;
  height: 4px;
  margin: 0 auto 20px;
  border-radius: 999px;
  background: rgba(104, 114, 108, .3);
}

.sheet-heading,
.identity-card,
.status-row,
.section-heading,
.draft-value,
.status-line,
.signout-button {
  display: flex;
  align-items: center;
}

.sheet-heading { justify-content: space-between; }
.account-kicker,
.account-title { display: block; }
.account-kicker { color: #be442e; font-size: 10px; font-weight: 800; letter-spacing: 3px; }
.account-title { margin-top: 8px; font-family: "Songti SC", "STSong", serif; font-size: 31px; font-weight: 800; }

.sheet-close {
  width: 38px;
  height: 38px;
  margin: 0;
  padding: 0;
  border: 1px solid rgba(104, 114, 108, .22);
  border-radius: 50%;
  background: rgba(255, 253, 248, .62);
  color: $muted;
  font-size: 24px;
  line-height: 36px;
}
.sheet-close::after,
.signout-button::after { border: 0; }

.identity-card {
  margin-top: 24px;
  padding: 18px;
  gap: 14px;
  border: 1px solid rgba(49, 91, 71, .14);
  border-radius: 16px;
  background: rgba(255, 253, 248, .86);
  box-shadow: 0 10px 30px rgba(36, 45, 40, .05);
}

.identity-seal {
  width: 52px;
  height: 52px;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 50% 50% 48% 52%;
  background: $ink;
  box-shadow: 0 0 0 6px rgba(223, 91, 63, .1);
  color: #fff;
  font-family: "Songti SC", "STSong", serif;
  font-size: 21px;
  font-weight: 800;
}

.identity-copy { min-width: 0; flex: 1; }
.identity-label,
.identity-value { display: block; }
.identity-label { color: $muted; font-size: 9px; font-weight: 700; letter-spacing: 2px; }
.identity-value { margin-top: 5px; overflow: hidden; font-size: 14px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.status-line { margin-top: 7px; gap: 6px; color: $green; font-size: 10px; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: $green; box-shadow: 0 0 0 3px rgba(49, 91, 71, .1); }

.space-section {
  margin-top: 16px;
  padding: 18px;
  border: 1px solid $line;
  border-radius: 16px;
  background: $surface;
}

.section-heading { margin-bottom: 7px; justify-content: space-between; font-size: 12px; font-weight: 800; letter-spacing: 1px; }
.room-code { color: $coral; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; letter-spacing: 1.5px; }
.status-row { min-height: 45px; justify-content: space-between; gap: 20px; border-top: 1px solid #ebe7de; }
.status-key { color: $muted; font-size: 10px; }
.status-value { font-size: 11px; font-weight: 700; text-align: right; }
.draft-value { gap: 7px; }
.draft-lock { padding: 2px 5px; border-radius: 5px; background: $sage; color: $green; font-size: 8px; font-weight: 800; }
.privacy-copy { display: block; padding-top: 12px; border-top: 1px solid #ebe7de; color: $muted; font-size: 10px; line-height: 1.7; }

.account-actions,
.platform-note { margin-top: 16px; }
.signout-button { width: 100%; min-height: 50px; margin: 0; padding: 0 16px; justify-content: space-between; border: 1px solid rgba(190, 68, 46, .34); border-radius: 12px; background: rgba(255, 253, 248, .45); color: #a23d2b; font-size: 12px; font-weight: 800; }
.signout-button[disabled] { opacity: .38; }
.action-arrow { font-size: 18px; font-weight: 400; }
.action-note { display: block; margin-top: 8px; color: $muted; font-size: 9px; line-height: 1.65; }

.platform-note { padding: 14px 16px; border-radius: 12px; background: rgba(223, 233, 220, .58); color: $green; font-size: 10px; line-height: 1.7; }
.platform-note-title { display: block; margin-bottom: 3px; font-weight: 800; }

@media (min-width: 720px) {
  .account-sheet { margin-bottom: 20px; border-radius: 26px; }
}
</style>
