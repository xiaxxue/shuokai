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

    <view class="mode-list" role="radiogroup" aria-label="表达路径">
      <button
        v-for="(option, index) in visibleModeOptions"
        :key="option.mode"
        class="mode-card"
        :class="[`mode-${option.mode.toLowerCase()}`, { selected: modelValue === option.mode }]"
        :disabled="disabled"
        :aria-label="`选择${option.title}：${option.shortTitle}`"
        role="radio"
        :aria-checked="modelValue === option.mode"
        @tap="$emit('update:modelValue', option.mode)"
      >
        <view class="mode-index"><text>0{{ index + 1 }}</text></view>
        <view class="mode-copy">
          <view class="mode-title-row">
            <text class="mode-title">{{ option.title }}</text>
            <text v-if="option.mode === 'NVC'" class="default-mark">推荐起点</text>
          </view>
          <text class="mode-short">{{ option.shortTitle }}</text>
          <text v-if="!inline" class="mode-description">{{ option.description }}</text>
        </view>
        <text class="mode-check" aria-hidden="true">{{ modelValue === option.mode ? disabled ? "…" : "✓" : "○" }}</text>
      </button>
    </view>

    <template v-if="inline">
      <view class="inline-privacy"><text aria-hidden="true">🔒</text><text>原话和私人对话不会发给对方</text></view>
      <button
        class="inline-confirm"
        :disabled="disabled || !modelValue"
        :aria-label="confirmLabel"
        @tap="$emit('confirm')"
      >{{ disabled ? "正在开始整理…" : confirmLabel }}</button>
      <text class="inline-change-note">选择后仍可更换</text>
      <button
        class="inline-pause"
        :class="{ selected: modelValue === 'PAUSE' }"
        :disabled="disabled"
        :aria-pressed="modelValue === 'PAUSE'"
        @tap="$emit('update:modelValue', 'PAUSE')"
      >{{ modelValue === 'PAUSE' ? "✓ 已选择暂停或结束" : "暂停或结束这次沟通" }}</button>
    </template>

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
import { computed } from "vue";
import { expressionModeOption, expressionModeOptions, type ExpressionMode } from "../domain/expression";

const props = withDefaults(defineProps<{
  modelValue: ExpressionMode | null;
  inline?: boolean;
  disabled?: boolean;
}>(), {
  inline: false,
  disabled: false,
});
defineEmits<{ "update:modelValue": [value: ExpressionMode]; manual: []; confirm: [] }>();

const visibleModeOptions = computed(() => props.inline
  ? expressionModeOptions.filter((option) => option.mode !== "PAUSE")
  : expressionModeOptions);
const confirmLabel = computed(() => {
  if (!props.modelValue) return "选择一条路径后开始整理";
  if (props.modelValue === "PAUSE") return "确认暂停或结束";
  return `用「${expressionModeOption(props.modelValue).title}」开始整理`;
});
</script>

<style scoped lang="scss">
.mode-screen { padding: 76rpx 52rpx 160rpx; }
.mode-screen.inline { width: 100%; padding: 18rpx 0 0; box-sizing: border-box; }
.mode-heading { display: flex; flex-direction: column; }
.inline-heading { display: flex; flex-direction: column; gap: 7rpx; }
.inline-title { color: #183029; font-size: 30rpx; font-weight: 800; line-height: 1.45; }
.inline-description { color: #6b7771; font-size: 23rpx; line-height: 1.55; }
.eyebrow { color: #c94933; font-size: 24rpx; font-weight: 700; letter-spacing: .14em; }
.title { display: block; max-width: 100%; margin-top: 30rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 52rpx; font-weight: 700; line-height: 1.32; white-space: normal; word-break: break-word; }
.description { margin-top: 24rpx; color: #66726e; font-size: 27rpx; line-height: 1.75; }
.mode-list { display: flex; flex-direction: column; gap: 20rpx; margin-top: 50rpx; }
.inline .mode-list { gap: 10rpx; margin-top: 18rpx; }
.mode-card { position: relative; box-sizing: border-box; display: flex; align-items: flex-start; width: 100%; min-height: 188rpx; padding: 30rpx 28rpx; overflow: hidden; border: 1rpx solid #d9d6cc; border-radius: 30rpx; background: rgba(255,255,255,.58); color: #183029; text-align: left; white-space: normal; box-shadow: none; }
.inline .mode-card { min-height: 112rpx; padding: 18rpx 18rpx; border: 2rpx solid #dedbd2; border-radius: 20rpx; background: #fbf8f1; }
.mode-card[disabled] { opacity: .56; }
.mode-card::after { border: 0; }
.mode-card.selected { border-color: #6f9281; background: #e7efe8; box-shadow: 0 10rpx 26rpx rgba(30,57,46,.07); }
.mode-fact_dispute.selected { border-color: #d8b487; background: #f5eadb; }
.mode-boundary.selected { border-color: #79998a; background: #dfeae3; }
.mode-pause.selected { border-color: #adb8b9; background: #e9edec; }
.mode-index { display: flex; align-items: center; justify-content: center; width: 62rpx; height: 62rpx; flex: 0 0 62rpx; border-radius: 50%; background: #f2eee5; color: #8d928d; font-family: Georgia, serif; font-size: 22rpx; }
.inline .mode-index { width: 50rpx; height: 50rpx; flex-basis: 50rpx; border-radius: 15rpx; }
.selected .mode-index { background: #183029; color: #fffdf7; }
.mode-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; margin-left: 24rpx; overflow: hidden; white-space: normal; }
.inline .mode-copy { align-self: center; margin-left: 16rpx; }
.mode-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8rpx 14rpx; min-width: 0; }
.mode-title { min-width: 0; font-family: "Songti SC", "STSong", serif; font-size: 34rpx; font-weight: 700; white-space: normal; word-break: break-word; }
.inline .mode-title { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 28rpx; font-weight: 800; }
.default-mark { padding: 3rpx 12rpx; border-radius: 999rpx; background: #f3d9d1; color: #b4422e; font-size: 19rpx; font-weight: 700; }
.mode-short { margin-top: 5rpx; color: #40584f; font-size: 24rpx; font-weight: 600; white-space: normal; }
.inline .mode-short { margin-top: 3rpx; font-size: 22rpx; }
.mode-description { margin-top: 13rpx; color: #727b77; font-size: 23rpx; line-height: 1.55; white-space: normal; word-break: break-word; }
.inline .mode-description { margin-top: 8rpx; font-size: 22rpx; }
.mode-check { width: 48px; height: 48px; display: flex; align-self: center; flex: 0 0 48px; align-items: center; justify-content: center; margin: -8rpx -8rpx -8rpx 8rpx; border-radius: 50%; color: #7b847f; font-size: 30rpx; }
.selected .mode-check { color: #fffdf7; background: #315847; font-weight: 900; }
.inline-privacy { display: flex; align-items: center; gap: 10rpx; margin: 18rpx 4rpx 0; color: #68736d; font-size: 20rpx; line-height: 1.5; }
.inline-confirm { width: 100%; min-height: 52px; margin: 18rpx 0 0; padding: 12rpx 22rpx; border-radius: 18rpx; background: #315847; color: #fffdf8; font-size: 27rpx; font-weight: 800; line-height: 1.35; box-shadow: 0 9rpx 20rpx rgba(31,71,54,.14); }
.inline-confirm::after, .inline-pause::after { border: 0; }
.inline-confirm[disabled] { background: #d9ddd9; color: #818a85; box-shadow: none; }
.inline-change-note { display: block; margin-top: 10rpx; color: #77817c; font-size: 19rpx; text-align: center; }
.inline-pause { min-height: 48px; margin: 2rpx auto 0; padding: 0 16rpx; background: transparent; color: #7a817d; font-size: 21rpx; }
.inline-pause.selected { color: #8f4739; font-weight: 800; }
.choice-note { display: flex; flex-direction: column; gap: 10rpx; margin-top: 34rpx; padding: 25rpx 28rpx; border-left: 4rpx solid #c94933; background: rgba(255,255,255,.42); color: #68716d; font-size: 23rpx; line-height: 1.65; }
.choice-note-mark { color: #b4422e; font-weight: 700; letter-spacing: .12em; }
.manual-entry { margin-top: 24rpx; background: transparent; color: #52675e; font-size: 25rpx; text-decoration: underline; text-underline-offset: 7rpx; }
.manual-entry::after { border: 0; }
</style>
