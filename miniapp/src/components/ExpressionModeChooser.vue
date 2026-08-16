<template>
  <view class="mode-screen" :class="{ inline }">
    <view v-if="!inline" class="mode-heading">
      <text class="eyebrow">先选择这次怎么说</text>
      <text class="title">不是每件事，都适合用同一种方式。</text>
      <text class="description">你来选路径，AI 只负责在这条路径里整理，不会替你判断事实或决定边界。</text>
    </view>

    <view v-else class="inline-heading">
      <text class="inline-title">选一个路径，我就开始整理</text>
      <text class="inline-description" role="status" aria-live="polite">{{ disabled ? "正在开始整理…" : "没有标准答案，分享前还可以更换。" }}</text>
    </view>

    <view class="mode-list">
      <button
        v-for="(option, index) in expressionModeOptions"
        :key="option.mode"
        class="mode-card"
        :class="[`mode-${option.mode.toLowerCase()}`, { selected: modelValue === option.mode }]"
        :disabled="disabled"
        :aria-label="`选择${option.title}：${option.shortTitle}`"
        :aria-pressed="modelValue === option.mode"
        @tap="$emit('update:modelValue', option.mode)"
      >
        <view class="mode-index"><text>0{{ index + 1 }}</text></view>
        <view class="mode-copy">
          <view class="mode-title-row">
            <text class="mode-title">{{ option.title }}</text>
            <text v-if="option.mode === 'NVC'" class="default-mark">推荐起点</text>
          </view>
          <text class="mode-short">{{ option.shortTitle }}</text>
          <text class="mode-description">{{ option.description }}</text>
        </view>
        <text class="mode-check">{{ modelValue === option.mode ? disabled ? "…" : "✓" : "→" }}</text>
      </button>
    </view>

    <view v-if="!inline" class="choice-note">
      <text class="choice-note-mark">由你决定</text>
      <text>选错也没关系，分享前可以返回重选。选择“暂停或结束”后，不会生成双方共识。</text>
    </view>
    <button
      v-if="!inline && modelValue && modelValue !== 'PAUSE'"
      class="manual-entry"
      @tap="$emit('manual')"
    >不用 AI，直接手动填写</button>
  </view>
</template>

<script setup lang="ts">
import { expressionModeOptions, type ExpressionMode } from "../domain/expression";

withDefaults(defineProps<{
  modelValue: ExpressionMode | null;
  inline?: boolean;
  disabled?: boolean;
}>(), {
  inline: false,
  disabled: false,
});
defineEmits<{ "update:modelValue": [value: ExpressionMode]; manual: [] }>();
</script>

<style scoped lang="scss">
.mode-screen { padding: 76rpx 52rpx 160rpx; }
.mode-screen.inline { width: 100%; padding: 22rpx 0 0; box-sizing: border-box; }
.mode-heading { display: flex; flex-direction: column; }
.inline-heading { display: flex; flex-direction: column; gap: 7rpx; }
.inline-title { color: #183029; font-size: 29rpx; font-weight: 800; line-height: 1.45; }
.inline-description { color: #6b7771; font-size: 24rpx; line-height: 1.55; }
.eyebrow { color: #c94933; font-size: 24rpx; font-weight: 700; letter-spacing: .14em; }
.title { display: block; max-width: 100%; margin-top: 30rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 52rpx; font-weight: 700; line-height: 1.32; white-space: normal; word-break: break-word; }
.description { margin-top: 24rpx; color: #66726e; font-size: 27rpx; line-height: 1.75; }
.mode-list { display: flex; flex-direction: column; gap: 20rpx; margin-top: 50rpx; }
.inline .mode-list { gap: 12rpx; margin-top: 20rpx; }
.mode-card { position: relative; box-sizing: border-box; display: flex; align-items: flex-start; width: 100%; min-height: 188rpx; padding: 30rpx 28rpx; overflow: hidden; border: 1rpx solid #d9d6cc; border-radius: 30rpx; background: rgba(255,255,255,.58); color: #183029; text-align: left; white-space: normal; box-shadow: none; }
.inline .mode-card { min-height: 132rpx; padding: 22rpx 20rpx; border-radius: 22rpx; background: #f7f4ed; }
.mode-card[disabled] { opacity: .56; }
.mode-card::after { border: 0; }
.mode-card.selected { border-color: #b6cbbd; background: #e7efe8; box-shadow: 0 16rpx 44rpx rgba(30,57,46,.08); }
.mode-fact_dispute.selected { border-color: #d8b487; background: #f5eadb; }
.mode-boundary.selected { border-color: #79998a; background: #dfeae3; }
.mode-pause.selected { border-color: #adb8b9; background: #e9edec; }
.mode-index { display: flex; align-items: center; justify-content: center; width: 62rpx; height: 62rpx; flex: 0 0 62rpx; border-radius: 50%; background: #f2eee5; color: #8d928d; font-family: Georgia, serif; font-size: 22rpx; }
.inline .mode-index { width: 52rpx; height: 52rpx; flex-basis: 52rpx; }
.selected .mode-index { background: #183029; color: #fffdf7; }
.mode-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; margin-left: 24rpx; overflow: hidden; white-space: normal; }
.inline .mode-copy { margin-left: 18rpx; }
.mode-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8rpx 14rpx; min-width: 0; }
.mode-title { min-width: 0; font-family: "Songti SC", "STSong", serif; font-size: 34rpx; font-weight: 700; white-space: normal; word-break: break-word; }
.inline .mode-title { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 29rpx; font-weight: 800; }
.default-mark { padding: 3rpx 12rpx; border-radius: 999rpx; background: #f3d9d1; color: #b4422e; font-size: 19rpx; font-weight: 700; }
.mode-short { margin-top: 5rpx; color: #40584f; font-size: 24rpx; font-weight: 600; white-space: normal; }
.inline .mode-short { margin-top: 3rpx; font-size: 23rpx; }
.mode-description { margin-top: 13rpx; color: #727b77; font-size: 23rpx; line-height: 1.55; white-space: normal; word-break: break-word; }
.inline .mode-description { margin-top: 8rpx; font-size: 22rpx; }
.mode-check { align-self: center; flex: 0 0 auto; margin-left: 14rpx; color: #b34b38; font-size: 30rpx; }
.choice-note { display: flex; flex-direction: column; gap: 10rpx; margin-top: 34rpx; padding: 25rpx 28rpx; border-left: 4rpx solid #c94933; background: rgba(255,255,255,.42); color: #68716d; font-size: 23rpx; line-height: 1.65; }
.choice-note-mark { color: #b4422e; font-weight: 700; letter-spacing: .12em; }
.manual-entry { margin-top: 24rpx; background: transparent; color: #52675e; font-size: 25rpx; text-decoration: underline; text-underline-offset: 7rpx; }
.manual-entry::after { border: 0; }
</style>
