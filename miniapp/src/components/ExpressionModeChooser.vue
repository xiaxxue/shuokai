<template>
  <view class="mode-screen">
    <view class="mode-heading">
      <text class="eyebrow">先选择这次怎么说</text>
      <text class="title">不是每件事，都适合用同一种方式。</text>
      <text class="description">你来选路径，AI 只负责在这条路径里整理，不会替你判断事实或决定边界。</text>
    </view>

    <view class="mode-list">
      <button
        v-for="(option, index) in expressionModeOptions"
        :key="option.mode"
        class="mode-card"
        :class="[`mode-${option.mode.toLowerCase()}`, { selected: modelValue === option.mode }]"
        @tap="$emit('update:modelValue', option.mode)"
      >
        <view class="mode-index"><text>0{{ index + 1 }}</text></view>
        <view class="mode-copy">
          <view class="mode-title-row">
            <text class="mode-title">{{ option.title }}</text>
            <text v-if="option.mode === 'NVC'" class="default-mark">默认</text>
          </view>
          <text class="mode-short">{{ option.shortTitle }}</text>
          <text class="mode-description">{{ option.description }}</text>
        </view>
        <text class="mode-check">{{ modelValue === option.mode ? "✓" : "→" }}</text>
      </button>
    </view>

    <view class="choice-note">
      <text class="choice-note-mark">由你决定</text>
      <text>选错也没关系，分享前可以返回重选。选择“暂停或结束”后，不会生成双方共识。</text>
    </view>
    <button
      v-if="modelValue && modelValue !== 'PAUSE'"
      class="manual-entry"
      @tap="$emit('manual')"
    >不用 AI，直接手动填写</button>
  </view>
</template>

<script setup lang="ts">
import { expressionModeOptions, type ExpressionMode } from "../domain/expression";

defineProps<{ modelValue: ExpressionMode | null }>();
defineEmits<{ "update:modelValue": [value: ExpressionMode]; manual: [] }>();
</script>

<style scoped lang="scss">
.mode-screen { padding: 76rpx 52rpx 160rpx; }
.mode-heading { display: flex; flex-direction: column; }
.eyebrow { color: #c94933; font-size: 24rpx; font-weight: 700; letter-spacing: .14em; }
.title { display: block; max-width: 100%; margin-top: 30rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 52rpx; font-weight: 700; line-height: 1.32; white-space: normal; word-break: break-word; }
.description { margin-top: 24rpx; color: #66726e; font-size: 27rpx; line-height: 1.75; }
.mode-list { display: flex; flex-direction: column; gap: 20rpx; margin-top: 50rpx; }
.mode-card { position: relative; box-sizing: border-box; display: flex; align-items: flex-start; width: 100%; min-height: 188rpx; padding: 30rpx 28rpx; overflow: hidden; border: 1rpx solid #d9d6cc; border-radius: 30rpx; background: rgba(255,255,255,.58); color: #183029; text-align: left; white-space: normal; box-shadow: none; }
.mode-card::after { border: 0; }
.mode-card.selected { border-color: #b6cbbd; background: #e7efe8; box-shadow: 0 16rpx 44rpx rgba(30,57,46,.08); }
.mode-fact_dispute.selected { border-color: #d8b487; background: #f5eadb; }
.mode-boundary.selected { border-color: #79998a; background: #dfeae3; }
.mode-pause.selected { border-color: #adb8b9; background: #e9edec; }
.mode-index { display: flex; align-items: center; justify-content: center; width: 62rpx; height: 62rpx; flex: 0 0 62rpx; border-radius: 50%; background: #f2eee5; color: #8d928d; font-family: Georgia, serif; font-size: 22rpx; }
.selected .mode-index { background: #183029; color: #fffdf7; }
.mode-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; margin-left: 24rpx; overflow: hidden; white-space: normal; }
.mode-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8rpx 14rpx; min-width: 0; }
.mode-title { min-width: 0; font-family: "Songti SC", "STSong", serif; font-size: 34rpx; font-weight: 700; white-space: normal; word-break: break-word; }
.default-mark { padding: 3rpx 12rpx; border-radius: 999rpx; background: #f3d9d1; color: #b4422e; font-size: 19rpx; font-weight: 700; }
.mode-short { margin-top: 5rpx; color: #40584f; font-size: 24rpx; font-weight: 600; white-space: normal; }
.mode-description { margin-top: 13rpx; color: #727b77; font-size: 23rpx; line-height: 1.55; white-space: normal; word-break: break-word; }
.mode-check { align-self: center; flex: 0 0 auto; margin-left: 14rpx; color: #b34b38; font-size: 30rpx; }
.choice-note { display: flex; flex-direction: column; gap: 10rpx; margin-top: 34rpx; padding: 25rpx 28rpx; border-left: 4rpx solid #c94933; background: rgba(255,255,255,.42); color: #68716d; font-size: 23rpx; line-height: 1.65; }
.choice-note-mark { color: #b4422e; font-weight: 700; letter-spacing: .12em; }
.manual-entry { margin-top: 24rpx; background: transparent; color: #52675e; font-size: 25rpx; text-decoration: underline; text-underline-offset: 7rpx; }
.manual-entry::after { border: 0; }
</style>
