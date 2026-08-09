<template>
  <view class="screen review-screen">
    <text class="eyebrow">发送前由你确认</text>
    <text class="title">这是你准备分享的版本</text>
    <text class="description">只分享下面四张卡，不会发送你的原始表达。点任一卡片可以返回修改。</text>
    <view class="review-card-list">
      <button
        v-for="(card, index) in nvcPerspectiveCards"
        :key="card.key"
        class="review-summary-card"
        :class="`tone-${index}`"
        @tap="emit('edit', card.key)"
      >
        <view class="review-card-heading">
          <text class="review-card-number">0{{ index + 1 }}</text>
          <text class="review-card-label">{{ card.label }}</text>
          <text class="review-edit">修改 →</text>
        </view>
        <text class="review-card-stem">{{ card.stem }}</text>
        <text class="review-card-copy">{{ perspective[card.key] }}</text>
      </button>
    </view>
    <view class="approval-note">
      <text>✓</text>
      <text>点击确认即表示：这四张卡准确代表你的意思，并允许系统分享给房间中的另一位参与者。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { nvcPerspectiveCards } from "../domain/nvc";
import type { Perspective } from "../domain/types";

defineProps<{
  perspective: Perspective;
}>();

const emit = defineEmits<{
  edit: [key: keyof Perspective];
}>();
</script>

<style scoped lang="scss">
$ink: #1c2923;
$muted: #68726c;
$line: #d8d3c8;
$coral-dark: #be442e;

.review-card-list {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.review-summary-card {
  width: 100%;
  padding: 15px 16px;
  border-radius: 12px;
  color: $ink;
  text-align: left;
}

.tone-0 { background: #e8eee8; }
.tone-1 { background: #f4e2d8; }
.tone-2 { background: #f2e8cf; }
.tone-3 { background: #dce9e7; }

.review-card-heading {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}

.review-card-number {
  color: rgba(28, 41, 35, .42);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
}

.review-card-label {
  color: #505e56;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 2px;
}

.review-card-stem {
  display: block;
  margin-top: 9px;
  color: $ink;
  font-family: "Songti SC", "STSong", serif;
  font-size: 14px;
  font-weight: 700;
}

.review-edit {
  margin-left: auto;
  color: $coral-dark;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
}

.review-card-copy {
  display: block;
  margin-top: 8px;
  color: $ink;
  font-size: 13px;
  line-height: 1.65;
}

.approval-note {
  margin-top: 16px;
  padding: 11px 13px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border: 1px solid $line;
  border-radius: 9px;
  color: $muted;
  font-size: 10px;
  line-height: 1.55;
}
</style>
