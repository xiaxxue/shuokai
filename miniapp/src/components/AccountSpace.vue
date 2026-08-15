<template>
  <view
    v-if="open"
    ref="dialogRoot"
    class="account-layer"
    role="dialog"
    aria-modal="true"
    aria-label="我的空间"
    tabindex="-1"
    @keydown="handleDialogKeydown"
  >
    <view class="account-backdrop" @tap="$emit('close')" />
    <view class="account-sheet" @tap.stop>
      <view class="sheet-handle" />
      <view class="sheet-heading">
        <view>
          <text class="account-kicker">只属于你的这一侧</text>
          <text class="account-title">我的空间</text>
        </view>
        <button ref="closeButton" class="sheet-close" aria-label="关闭我的空间" @tap="$emit('close')">×</button>
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

      <view class="archive-section">
        <button class="archive-heading" aria-label="查看历史 AI 私人对话" @tap="showAiHistory = !showAiHistory">
          <view><text class="archive-kicker">私人档案</text><text class="archive-title">历史 AI 对话</text></view>
          <text class="archive-count">最近 {{ aiConversationItems.length }} 次 {{ showAiHistory ? '收起' : '查看' }} →</text>
        </button>
        <view v-if="showAiHistory" class="archive-body">
          <text v-if="aiArchiveLoading" class="archive-state">正在读取你保存过的私人对话…</text>
          <view v-else-if="aiArchiveError" class="archive-state archive-error">
            <text>{{ aiArchiveError }}</text><button @tap="$emit('refresh-ai-data')">重新读取</button>
          </view>
          <view v-else-if="!aiConversationItems.length" class="archive-state">
            <text>还没有保存过 AI 私人对话。进入一间沟通房间并开始讲述后，会自动出现在这里。</text>
          </view>
          <template v-else>
            <button
              v-for="item in aiConversationItems"
              :key="item.roomId"
              class="archive-row"
              @tap="$emit('open-ai-history', item)"
            >
              <text class="archive-topic">{{ item.topic }}</text>
              <text class="archive-summary">{{ item.summary }}</text>
              <text class="archive-meta">{{ item.role === 'A' ? '我发起的沟通' : '我回应的沟通' }} · {{ item.ready ? '已听清' : '还在继续' }} · {{ archiveTime(item.updatedAt) }} · {{ item.roomCode }}</text>
            </button>
          </template>
        </view>
      </view>

      <view class="archive-section memory-section">
        <button class="archive-heading" aria-label="查看 AI 记住了什么" @tap="showMemories = !showMemories">
          <view><text class="archive-kicker">由你控制</text><text class="archive-title">AI 记住了什么</text></view>
          <text class="archive-count">{{ personalMemories.length + relationshipMemories.length }} 条 {{ showMemories ? '收起' : '查看' }} →</text>
        </button>
        <view v-if="showMemories" class="archive-body memory-body">
          <text v-if="aiArchiveLoading" class="archive-state">正在读取你确认过的记忆…</text>
          <view v-else-if="aiArchiveError" class="archive-state archive-error">
            <text>{{ aiArchiveError }}</text><button @tap="$emit('refresh-ai-data')">重新读取</button>
          </view>
          <view v-else-if="!personalMemories.length && !relationshipMemories.length" class="archive-state">
            <text>AI 还没有记住长期内容。只有你亲自确认的内容才会出现在这里。</text>
          </view>
          <template v-else>
            <view v-if="personalMemories.length" class="memory-group">
              <text class="memory-group-title">只属于我的记忆</text>
              <view v-for="item in personalMemories" :key="item.id" class="memory-card" :class="`memory-${item.kind.toLowerCase()}`">
                <text class="memory-label">{{ personalMemoryKindLabel[item.kind] }} · {{ item.status === 'PROPOSED' ? '等待你决定' : '已确认' }}</text>
                <text class="memory-content">{{ item.content }}</text>
                <text v-if="item.reason" class="memory-reason">为什么可能有用：{{ item.reason }}</text>
                <text v-if="item.topic" class="memory-source">来自：{{ item.topic }}{{ item.roomCode ? ` · ${item.roomCode}` : '' }}</text>
                <view class="memory-actions">
                  <template v-if="item.status === 'PROPOSED'">
                    <button @tap="$emit('decide-memory', item, 'CONFIRM')">记住这条</button>
                    <button @tap="$emit('edit-memory', item)">修改后记住</button>
                    <button @tap="$emit('decide-memory', item, 'REJECT')">只用于这次</button>
                  </template>
                  <template v-else>
                    <button @tap="$emit('edit-memory', item)">修改</button>
                    <button class="forget-action" @tap="$emit('forget-memory', item)">停止记住</button>
                  </template>
                </view>
              </view>
            </view>
            <view v-if="relationshipMemories.length" class="memory-group relationship-group">
              <text class="memory-group-title">双方可共同记住的事</text>
              <text class="memory-group-note">“内容准确”不等于同意长期记住。只有双方分别同意后，AI 才会在以后与你们两人的沟通中参考。</text>
              <view v-for="item in relationshipMemories" :key="item.id" class="relationship-row">
                <text class="memory-label">{{ relationshipMemoryKindLabel[item.kind] }} · {{ relationshipStatus(item) }}</text>
                <text class="memory-content">{{ item.content }}</text>
                <text class="memory-source">来自双方确认准确的共同理解 · {{ item.topic }}</text>
                <view class="memory-actions">
                  <text v-if="!item.sourceValid" class="memory-waiting">来源共同理解已失效，AI 不会再使用，也不能重新启用。</text>
                  <template v-else-if="item.status === 'ACTIVE'">
                    <button class="forget-action" @tap="$emit('decide-relationship-memory', item, 'STOP')">停止共同记住</button>
                  </template>
                  <template v-else-if="item.myDecision === 'REMEMBER'">
                    <text class="memory-waiting">{{ item.partnerDecision === 'DECLINE' ? '对方目前不同意长期记住' : '已同意，等待对方决定' }}</text>
                    <button class="forget-action" @tap="$emit('decide-relationship-memory', item, 'STOP')">撤回我的同意</button>
                  </template>
                  <template v-else>
                    <button @tap="$emit('decide-relationship-memory', item, 'REMEMBER')">同意共同记住</button>
                    <button v-if="item.myDecision !== 'DECLINE'" @tap="$emit('decide-relationship-memory', item, 'DECLINE')">这次不要记住</button>
                  </template>
                </view>
              </view>
            </view>
          </template>
        </view>
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { RoomHistoryItem } from "../domain/room-history";
import {
  personalMemoryKindLabel,
  relationshipMemoryKindLabel,
  type AiConversationHistoryItem,
  type PersonalMemoryItem,
  type RelationshipMemoryItem,
} from "../domain/ai-memory";
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
  aiConversationItems: AiConversationHistoryItem[];
  personalMemories: PersonalMemoryItem[];
  relationshipMemories: RelationshipMemoryItem[];
  aiArchiveLoading: boolean;
  aiArchiveError: string;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  signout: [];
  "refresh-history": [];
  "load-more-history": [];
  "open-history": [item: RoomHistoryItem];
  "refresh-ai-data": [];
  "open-ai-history": [item: AiConversationHistoryItem];
  "decide-memory": [item: PersonalMemoryItem, decision: "CONFIRM" | "REJECT"];
  "edit-memory": [item: PersonalMemoryItem];
  "forget-memory": [item: PersonalMemoryItem];
  "decide-relationship-memory": [item: RelationshipMemoryItem, decision: "REMEMBER" | "DECLINE" | "STOP"];
}>();

const showAiHistory = ref(false);
const showMemories = ref(false);
const dialogRoot = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
const closeButton = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
let previousFocus: HTMLElement | null = null;

function domElement(value: HTMLElement | { $el?: HTMLElement } | null) {
  return value instanceof HTMLElement ? value : value?.$el ?? null;
}

watch(() => props.open, async (open) => {
  if (typeof document === "undefined") return;
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    domElement(closeButton.value)?.focus();
  } else {
    previousFocus?.focus();
    previousFocus = null;
  }
});

onBeforeUnmount(() => {
  if (typeof document !== "undefined") previousFocus?.focus();
});

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (event.key !== "Tab") return;
  const root = domElement(dialogRoot.value);
  if (!root) return;
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const identityMark = computed(() => {
  const value = props.identity.trim();
  if (!value) return "我";
  if (value.includes("@")) return value.slice(0, 1).toUpperCase();
  return value.slice(0, 1);
});

function archiveTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function relationshipStatus(item: RelationshipMemoryItem) {
  if (!item.sourceValid) return "来源已失效";
  if (item.status === "ACTIVE") return "双方已同意";
  if (item.myDecision === "REMEMBER") return "等待对方同意";
  if (item.myDecision === "DECLINE") return "你选择了不长期记住";
  if (item.partnerDecision === "DECLINE") return "对方选择了不长期记住";
  return "等待双方决定";
}
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
  width: 48px;
  height: 48px;
  margin: 0;
  padding: 0;
  border: 1px solid rgba(104, 114, 108, .22);
  border-radius: 50%;
  background: rgba(255, 253, 248, .62);
  color: $muted;
  font-size: 24px;
  line-height: 46px;
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

.archive-section { margin-top: 16px; border: 1px solid $line; border-radius: 16px; overflow: hidden; background: $surface; }
.archive-heading { width: 100%; min-height: 72px; margin: 0; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-radius: 0; background: transparent; color: $ink; text-align: left; }
.archive-heading::after, .archive-row::after, .archive-state button::after, .memory-actions button::after { border: 0; }
.archive-kicker, .archive-title, .archive-count, .archive-topic, .archive-summary, .archive-meta, .memory-group-title, .memory-group-note, .memory-label, .memory-content, .memory-reason, .memory-source, .memory-waiting { display: block; }
.archive-kicker { color: #be442e; font-size: 9px; font-weight: 800; letter-spacing: 2px; }
.archive-title { margin-top: 5px; font-family: "Songti SC", "STSong", serif; font-size: 20px; font-weight: 800; }
.archive-count { flex: none; color: $green; font-size: 10px; font-weight: 700; }
.archive-body { border-top: 1px solid #ebe7de; }
.archive-state { display: block; padding: 18px 16px; color: $muted; font-size: 11px; line-height: 1.7; }
.archive-error { color: #9f4433; }
.archive-state button { min-height: 48px; margin: 8px 0 0; padding: 0 12px; background: #efeae0; color: $green; font-size: 11px; }
.archive-row { width: 100%; min-height: 88px; margin: 0; padding: 15px 16px; border-radius: 0; border-bottom: 1px solid #ebe7de; background: transparent; color: $ink; text-align: left; }
.archive-row:last-child { border-bottom: 0; }
.archive-topic { font-family: "Songti SC", "STSong", serif; font-size: 15px; font-weight: 800; }
.archive-summary { margin-top: 5px; display: -webkit-box; overflow: hidden; color: #58645e; font-size: 11px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.archive-meta { margin-top: 7px; color: #89918c; font-size: 9px; letter-spacing: .4px; }
.memory-section { background: #f7f2e9; }
.memory-body { padding: 0 16px 16px; }
.memory-group { padding-top: 16px; }
.memory-group-title { margin-bottom: 9px; color: $green; font-size: 11px; font-weight: 800; letter-spacing: 1px; }
.memory-group-note { margin-bottom: 10px; color: $muted; font-size: 9px; line-height: 1.65; }
.memory-card { margin-top: 10px; padding: 14px 14px 14px 16px; border-left: 3px solid #7a9988; border-radius: 0 12px 12px 0; background: #fffdf8; }
.memory-boundary { border-left-color: #c6543e; }
.memory-trigger { border-left-color: #b88750; }
.memory-label { color: $green; font-size: 9px; font-weight: 800; }
.memory-content { margin-top: 6px; font-size: 12px; font-weight: 700; line-height: 1.6; }
.memory-reason, .memory-source { margin-top: 6px; color: $muted; font-size: 9px; line-height: 1.55; }
.memory-actions { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.memory-actions button { min-height: 48px; margin: 0; padding: 0 12px; border-radius: 999px; background: #e7eee8; color: $green; font-size: 10px; font-weight: 700; }
.memory-actions .forget-action { background: #f7e6e0; color: #a23d2b; }
.memory-waiting { align-self: center; color: $muted; font-size: 9px; line-height: 1.5; }
.relationship-group { margin-top: 16px; border-top: 1px solid #ddd6ca; }
.relationship-row { padding: 13px 0; border-bottom: 1px solid #e6dfd4; }
.relationship-row:last-child { border-bottom: 0; }

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
