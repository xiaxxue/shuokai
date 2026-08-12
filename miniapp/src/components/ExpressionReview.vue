<template>
  <view class="review-screen">
    <text class="eyebrow">AI 已按你选择的路径整理</text>
    <text class="title">这不是答案，是一份等你确认的草稿。</text>
    <text class="description">逐项修改到准确为止。只有你点“确认并分享”后，对方才能看到下面这些表达卡。</text>

    <view v-if="modelValue.safetyDisposition !== 'ALLOW'" class="safety-card" :class="`safety-${modelValue.safetyDisposition.toLowerCase()}`">
      <text class="safety-label">{{ safetyLabel }}</text>
      <text class="safety-copy">{{ modelValue.safetyMessage || "请先确认当前情境是否适合继续分享。" }}</text>
    </view>

    <view class="path-ribbon">
      <text>当前路径</text>
      <text class="path-name">{{ option.title }}</text>
      <button class="path-change" @tap="$emit('change-mode')">重选</button>
    </view>

    <view class="private-source">
      <view class="private-source-top"><text>你的原话</text><text>仅自己可见</text></view>
      <text class="private-source-copy">{{ sourceText }}</text>
    </view>

    <ExpressionClarification
      :question="clarificationQuestion"
      :answer="clarificationAnswer"
      :turn-count="clarificationTurnCount"
      :max-turns="clarificationMaxTurns"
      :busy="clarificationBusy"
      @update:answer="$emit('update:clarification-answer', $event)"
      @continue="$emit('continue-clarification')"
      @skip="$emit('skip-clarification')"
    />

    <view class="share-heading">
      <text class="share-kicker">对方将看到以下卡片</text>
      <text>请确认它们准确，没有遗漏你在意的边界。</text>
    </view>

    <view class="expression-stack">
      <view v-for="(field, index) in option.fields" :key="field.key" class="expression-card">
        <view class="card-top">
          <text class="card-number">0{{ index + 1 }}</text>
          <view class="card-heading">
            <text class="card-label">{{ field.label }}</text>
            <text class="card-prompt">{{ field.prompt }}</text>
          </view>
        </view>
        <textarea
          class="card-input"
          :value="modelValue.fields[field.key]"
          :maxlength="3000"
          :placeholder="field.placeholder"
          @input="updateField(field.key, $event)"
        />
        <text class="count">{{ modelValue.fields[field.key]?.length ?? 0 }} / 3000</text>
      </view>
    </view>

    <text class="private-note">🔒 原话和 AI 草稿仍在你的私人空间；分享内容只包含你最后确认的卡片。分享后对方可能已经阅读，撤回不能保证对方忘记已看到的内容。</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { expressionModeOption, type EditableExpression } from "../domain/expression";
import ExpressionClarification from "./ExpressionClarification.vue";

const props = defineProps<{
  modelValue: EditableExpression;
  sourceText: string;
  clarificationQuestion: string;
  clarificationAnswer: string;
  clarificationTurnCount: number;
  clarificationMaxTurns: number;
  clarificationBusy: boolean;
}>();
const emit = defineEmits<{
  "update-field": [key: string, value: string];
  "change-mode": [];
  "update:clarification-answer": [value: string];
  "continue-clarification": [];
  "skip-clarification": [];
}>();

const option = computed(() => expressionModeOption(props.modelValue.mode));
const safetyLabel = computed(() => ({
  WARN: "分享前请留意",
  BLOCK_SHARE: "暂不建议分享",
  PAUSE: "建议先暂停",
  ALLOW: "",
})[props.modelValue.safetyDisposition]);

function updateField(key: string, event: Event) {
  const value = (event as unknown as { detail: { value: string } }).detail.value;
  emit("update-field", key, value);
}
</script>

<style scoped lang="scss">
.review-screen { padding: 72rpx 52rpx 160rpx; }
.eyebrow { color: #c94933; font-size: 24rpx; font-weight: 700; letter-spacing: .12em; }
.title { display: block; margin-top: 28rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 50rpx; font-weight: 700; line-height: 1.35; }
.description { display: block; margin-top: 22rpx; color: #68736f; font-size: 26rpx; line-height: 1.75; }
.safety-card { display: flex; flex-direction: column; gap: 10rpx; margin-top: 34rpx; padding: 26rpx 28rpx; border: 1rpx solid #e1b492; border-radius: 24rpx; background: #fff0df; }
.safety-block_share, .safety-pause { border-color: #d59c93; background: #f9e5e1; }
.safety-label { color: #a34631; font-size: 24rpx; font-weight: 800; }
.safety-copy { color: #6c5148; font-size: 24rpx; line-height: 1.6; }
.path-ribbon { display: flex; align-items: center; margin-top: 38rpx; padding: 20rpx 24rpx; border-radius: 22rpx; background: #e3ece5; color: #66736d; font-size: 23rpx; }
.path-name { margin-left: 14rpx; color: #24483a; font-weight: 800; }
.path-change { margin: 0 0 0 auto; padding: 8rpx 16rpx; background: transparent; color: #b34632; font-size: 23rpx; line-height: 1.2; }
.path-change::after { border: 0; }
.private-source { margin-top: 24rpx; padding: 26rpx; border: 1rpx dashed #c9c5bb; border-radius: 22rpx; background: rgba(250,248,241,.7); }
.private-source-top { display: flex; justify-content: space-between; color: #365848; font-size: 22rpx; font-weight: 800; }
.private-source-top text:last-child { color: #8b938e; font-weight: 500; }
.private-source-copy { display: block; max-height: 180rpx; margin-top: 16rpx; overflow: hidden; color: #64706a; font-size: 23rpx; line-height: 1.65; }
.share-heading { display: flex; flex-direction: column; gap: 7rpx; margin-top: 38rpx; color: #7a817d; font-size: 22rpx; }
.share-kicker { color: #b64733; font-size: 24rpx; font-weight: 800; }
.expression-stack { display: flex; flex-direction: column; gap: 24rpx; margin-top: 28rpx; }
.expression-card { position: relative; padding: 30rpx; border: 1rpx solid #d9d5ca; border-radius: 28rpx; background: rgba(255,255,255,.68); }
.card-top { display: flex; gap: 20rpx; }
.card-number { color: #bd4b36; font-family: Georgia, serif; font-size: 22rpx; }
.card-heading { display: flex; flex-direction: column; gap: 7rpx; }
.card-label { color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 32rpx; font-weight: 700; }
.card-prompt { color: #718078; font-size: 22rpx; line-height: 1.5; }
.card-input { box-sizing: border-box; width: 100%; min-height: 190rpx; margin-top: 22rpx; padding: 22rpx; border-radius: 19rpx; background: #faf8f2; color: #233a32; font-size: 27rpx; line-height: 1.7; }
.count { display: block; margin-top: 10rpx; color: #9a9b93; font-size: 20rpx; text-align: right; }
.private-note { display: block; margin-top: 30rpx; color: #6b7872; font-size: 22rpx; line-height: 1.6; }
</style>
