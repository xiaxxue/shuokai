<template>
  <view class="history-ledger">
    <view class="ledger-heading">
      <view>
        <text class="ledger-kicker">沟通存档</text>
        <text class="ledger-title">历史沟通</text>
      </view>
      <button class="ledger-refresh" :disabled="loading" @tap="$emit('refresh')">
        {{ loading && !items.length ? "读取中" : "刷新" }}
      </button>
    </view>

    <view v-if="error" class="history-error">
      <text>{{ error }}</text>
      <button @tap="$emit('refresh')">再试一次</button>
    </view>

    <view v-else-if="loading && !items.length" class="history-loading" aria-label="正在读取历史沟通">
      <view v-for="index in 2" :key="index" class="loading-line" />
    </view>

    <view v-else-if="!items.length" class="history-empty">
      <text class="empty-mark">○</text>
      <text class="empty-title">还没有留下沟通记录</text>
      <text class="empty-copy">发起或加入一次沟通后，它会安全地出现在这里。</text>
    </view>

    <template v-else>
      <view v-if="activeItems.length" class="history-group">
        <view class="group-heading"><text>仍在进行</text><text>{{ activeItems.length }}</text></view>
        <button
          v-for="(item, index) in activeItems"
          :key="item.roomId"
          class="history-entry"
          :class="{ current: item.roomId === currentRoomId }"
          @tap="$emit('open-room', item)"
        >
          <view class="entry-index"><text>{{ folio(index) }}</text></view>
          <view class="entry-copy">
            <view class="entry-topline">
              <text class="entry-status">{{ statusLabel(item) }}</text>
              <text>{{ formatDate(item.updatedAt) }}</text>
            </view>
            <text class="entry-topic-label">具体话题</text>
            <text class="entry-title">{{ item.topic || fallbackTopic(item) }}</text>
            <text class="entry-intent">意图：{{ item.goal || "尚未选择沟通意图" }}</text>
            <text class="entry-meta">{{ roleLabel(item) }} · {{ participantLabel(item) }}{{ roundLabel(item) }}</text>
            <view class="entry-foot">
              <text class="entry-code">{{ item.code }}</text>
              <text class="entry-action">{{ item.roomId === currentRoomId ? "回到当前进度" : "查看并继续" }} →</text>
            </view>
          </view>
        </button>
      </view>

      <view v-if="archivedItems.length" class="history-group archived-group">
        <view class="group-heading"><text>已告一段落</text><text>{{ archivedItems.length }}</text></view>
        <button
          v-for="(item, index) in archivedItems"
          :key="item.roomId"
          class="history-entry archived"
          @tap="$emit('open-room', item)"
        >
          <view class="entry-index"><text>{{ folio(activeItems.length + index) }}</text></view>
          <view class="entry-copy">
            <view class="entry-topline">
              <text class="entry-status">{{ statusLabel(item) }}</text>
              <text>{{ formatDate(item.updatedAt) }}</text>
            </view>
            <text class="entry-topic-label">具体话题</text>
            <text class="entry-title">{{ item.topic || fallbackTopic(item) }}</text>
            <text class="entry-intent">意图：{{ item.goal || "尚未选择沟通意图" }}</text>
            <text class="entry-meta">{{ roleLabel(item) }} · {{ participantLabel(item) }}{{ roundLabel(item) }}</text>
            <view class="entry-foot">
              <text class="entry-code">{{ item.code }}</text>
              <text class="entry-action">回看记录 →</text>
            </view>
          </view>
        </button>
      </view>

      <button v-if="hasMore" class="load-more" :disabled="loading" @tap="$emit('load-more')">
        {{ loading ? "正在翻页" : "查看更早的沟通" }}
      </button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RoomHistoryItem } from "../domain/room-history";

const props = defineProps<{
  items: RoomHistoryItem[];
  currentRoomId: string;
  loading: boolean;
  error: string;
  hasMore: boolean;
}>();

defineEmits<{
  refresh: [];
  "load-more": [];
  "open-room": [item: RoomHistoryItem];
}>();

function isArchived(item: RoomHistoryItem) {
  return item.state === "COMPLETED" || ["COMPLETED", "ENDED"].includes(item.phaseV2 ?? "");
}

const activeItems = computed(() => props.items.filter((item) => !isArchived(item)));
const archivedItems = computed(() => props.items.filter(isArchived));

function folio(index: number) {
  return String(index + 1).padStart(2, "0");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待确认";
  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function statusLabel(item: RoomHistoryItem) {
  if (isArchived(item)) return "已完成";
  if (item.phaseV2 === "PAUSED") return "已暂停";
  if (item.phaseV2 === "DIALOGUE") return `对话第 ${Math.max(item.dialogueRound, 1)} 轮`;
  if (["UNDERSTANDING_GENERATING", "UNDERSTANDING_CONFIRMING"].includes(item.phaseV2 ?? "")) return "整理共同理解";
  if (["ACTION_GENERATING", "ACTION_CONFIRMING"].includes(item.phaseV2 ?? "")) return "确认下一步";
  if (item.participantCount < 2) return "等待对方";
  return "整理表达中";
}

function fallbackTopic(item: RoomHistoryItem) {
  if (isArchived(item)) return "这次沟通没有留下可辨认的话题";
  return "尚未写下具体话题";
}

function roleLabel(item: RoomHistoryItem) {
  return item.role === "A" ? "我是发起者" : "我是受邀者";
}

function participantLabel(item: RoomHistoryItem) {
  return item.participantCount > 1 ? "双方已加入" : "尚未邀请成功";
}

function roundLabel(item: RoomHistoryItem) {
  return item.dialogueRound > 0 ? ` · ${item.dialogueRound} 轮记录` : "";
}
</script>

<style scoped lang="scss">
$paper: #f3efe6;
$surface: #fffdf8;
$ink: #1c2923;
$muted: #68726c;
$line: #d8d3c8;
$coral: #be442e;
$green: #315b47;
$sage: #dfe9dc;

.history-ledger {
  margin-top: 16px;
  padding: 18px;
  border: 1px solid $line;
  border-radius: 18px;
  background: rgba(255, 253, 248, .88);
}

.ledger-heading,
.group-heading,
.entry-topline,
.entry-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ledger-kicker,
.ledger-title { display: block; }
.ledger-kicker { color: $coral; font-size: 9px; font-weight: 800; letter-spacing: 2.4px; }
.ledger-title { margin-top: 5px; font-family: "Songti SC", "STSong", serif; font-size: 24px; font-weight: 800; }

.ledger-refresh {
  min-width: 52px;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid rgba(49, 91, 71, .2);
  border-radius: 999px;
  background: transparent;
  color: $green;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
}
.ledger-refresh::after,
.history-entry::after,
.load-more::after,
.history-error button::after { border: 0; }

.history-group { margin-top: 20px; }
.group-heading { margin-bottom: 8px; color: $muted; font-size: 9px; font-weight: 800; letter-spacing: 1.4px; }

.history-entry {
  width: 100%;
  min-height: 0;
  margin: 0;
  padding: 15px 0;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  border: 0;
  border-top: 1px solid #e6e0d6;
  border-radius: 0;
  background: transparent;
  color: $ink;
  line-height: 1.4;
  text-align: left;
}
.history-entry.current { margin: 0 -8px; padding: 15px 8px; width: calc(100% + 16px); border-radius: 12px; background: linear-gradient(100deg, rgba(223, 233, 220, .72), rgba(223, 233, 220, .2)); }
.entry-index { padding-top: 2px; color: $coral; font-family: Georgia, serif; font-size: 10px; font-weight: 700; }
.entry-copy { min-width: 0; }
.entry-topline { color: $muted; font-size: 8px; letter-spacing: .4px; }
.entry-status { color: $green; font-weight: 800; }
.entry-topic-label { display: block; margin-top: 8px; color: $coral; font-size: 7px; font-weight: 800; letter-spacing: 1.2px; }
.entry-title { display: -webkit-box; margin-top: 3px; overflow: hidden; font-family: "Songti SC", "STSong", serif; font-size: 16px; font-weight: 800; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.entry-intent { display: block; margin-top: 6px; color: $green; font-size: 9px; line-height: 1.5; }
.entry-meta { display: block; margin-top: 5px; color: $muted; font-size: 9px; }
.entry-foot { margin-top: 10px; }
.entry-code { color: $muted; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 8px; letter-spacing: 1.2px; }
.entry-action { color: $coral; font-size: 9px; font-weight: 800; }
.archived-group { margin-top: 12px; }
.history-entry.archived { opacity: .82; }
.history-entry.archived .entry-status { color: $muted; }

.history-empty,
.history-error { margin-top: 18px; padding: 22px 14px; border-radius: 13px; background: $paper; text-align: center; }
.empty-mark,
.empty-title,
.empty-copy { display: block; }
.empty-mark { color: $coral; font-family: Georgia, serif; font-size: 29px; }
.empty-title { margin-top: 6px; font-family: "Songti SC", "STSong", serif; font-size: 15px; font-weight: 800; }
.empty-copy { margin-top: 6px; color: $muted; font-size: 9px; line-height: 1.7; }
.history-error { color: #9d3929; font-size: 10px; line-height: 1.6; }
.history-error button { margin-top: 8px; padding: 5px; background: transparent; color: $coral; font-size: 9px; }
.history-loading { margin-top: 16px; }
.loading-line { height: 92px; margin-top: 8px; border-radius: 12px; background: linear-gradient(100deg, #ede8de 25%, #f8f5ee 45%, #ede8de 65%); background-size: 220% 100%; animation: ledger-shimmer 1.2s linear infinite; }
@keyframes ledger-shimmer { to { background-position: -220% 0; } }

.load-more { width: 100%; margin: 12px 0 0; padding: 11px; border: 1px dashed rgba(49, 91, 71, .3); border-radius: 10px; background: rgba(223, 233, 220, .35); color: $green; font-size: 9px; font-weight: 800; }
</style>
