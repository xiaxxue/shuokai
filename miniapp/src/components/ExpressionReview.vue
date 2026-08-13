<template>
  <view class="review-screen">
    <view class="review-intro">
      <view class="intro-meta">
        <text class="eyebrow">{{ isSummary ? "AI 对话已整理完成" : "修改表达卡" }}</text>
        <text class="step-pill">{{ isSummary ? "待你确认" : `${currentStep + 1} / ${option.fields.length}` }}</text>
      </view>
      <text class="title">{{ isSummary ? "这是根据刚才对话整理的表达卡。" : `修改「${activeField?.label ?? "表达"}」` }}</text>
      <text class="description">{{ isSummary ? "请确认它准确表达了你的意思。你可以修改任一部分，也可以继续补充；确认后才会分享给对方。" : "把文字改到真正符合你的意思。保存后会回到整张表达卡，再由你确认。" }}</text>
    </view>

    <view v-if="modelValue.safetyDisposition !== 'ALLOW'" class="safety-note">
      <text class="safety-title">{{ safetyLabel }}</text>
      <text>{{ modelValue.safetyMessage || "请先确认当前情境是否适合继续分享。" }}</text>
      <button v-if="shareBlocked" class="safety-action" @tap="$emit('change-mode')">重选更合适的路径</button>
    </view>

    <view class="context-bar">
      <view class="path-copy"><text>当前路径</text><text>{{ option.title }}</text></view>
      <view class="context-actions">
        <button aria-label="查看或收起你的原话" @tap="sourceOpen = !sourceOpen">{{ sourceOpen ? "收起原话" : "查看原话" }}</button>
        <button @tap="$emit('change-mode')">重选</button>
      </view>
    </view>
    <view v-if="sourceOpen" class="private-source">
      <view class="private-source-meta"><text>你的原话</text><text>仅自己可见</text></view>
      <text class="private-source-copy">{{ sourceText }}</text>
    </view>

    <view v-if="!isSummary && activeField" class="single-card">
      <view class="card-heading">
        <text class="card-number">0{{ currentStep + 1 }}</text>
        <view class="card-title-group">
          <view class="card-title-line">
            <text class="card-label">{{ activeField.label }}</text>
            <text class="field-status">{{ isOptionalField(activeField.key) ? "可选" : "需要确认" }}</text>
          </view>
          <text class="card-prompt">{{ activeField.prompt }}</text>
        </view>
      </view>
      <textarea
        class="card-input"
        :value="modelValue.fields[activeField.key]"
        :maxlength="3000"
        :placeholder="activeField.placeholder"
        :aria-label="`${activeField.label}卡片内容`"
        @input="updateField(activeField.key, $event)"
      />
      <view class="input-meta">
        <text>{{ modelValue.fields[activeField.key]?.trim() ? "这张卡已填写" : isOptionalField(activeField.key) ? "可以留空" : "填写后才能继续" }}</text>
        <text>{{ modelValue.fields[activeField.key]?.length ?? 0 }} / 3000</text>
      </view>
    </view>

    <view v-else class="share-summary">
      <view class="summary-heading">
        <text>你的表达卡</text>
        <text>{{ option.fields.length }} 个部分 · 点击可修改</text>
      </view>
      <view class="summary-list">
        <button
          v-for="(field, index) in option.fields"
          :key="field.key"
          class="summary-row"
          :aria-label="`修改${field.label}`"
          @tap="$emit('edit-step', index)"
        >
          <text class="summary-index">0{{ index + 1 }}</text>
          <view class="summary-copy">
            <text class="summary-label">{{ field.label }}</text>
            <text>{{ modelValue.fields[field.key] || (isOptionalField(field.key) ? "未补充（可选）" : "尚未填写") }}</text>
          </view>
          <text class="summary-edit">修改</text>
        </button>
      </view>
      <view class="privacy-card">
        <text class="privacy-mark">私</text>
        <view>
          <text class="privacy-title">仍然只属于你的内容</text>
          <text>原话、AI 追问与中间草稿不会进入共同空间。只有这张表达卡会在你确认后分享；对方阅读后无法保证完全撤回。</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { expressionModeOption, type EditableExpression } from "../domain/expression";

const props = defineProps<{
  modelValue: EditableExpression;
  sourceText: string;
  currentStep: number;
}>();
const emit = defineEmits<{
  "update-field": [key: string, value: string];
  "change-mode": [];
  "edit-step": [index: number];
}>();

const sourceOpen = ref(false);
const option = computed(() => expressionModeOption(props.modelValue.mode));
const isSummary = computed(() => props.currentStep >= option.value.fields.length);
const activeField = computed(() => isSummary.value ? null : option.value.fields[props.currentStep]);
const shareBlocked = computed(() => ["BLOCK_SHARE", "PAUSE"].includes(props.modelValue.safetyDisposition));
const safetyLabel = computed(() => ({
  WARN: "分享前请留意",
  BLOCK_SHARE: "这份内容暂时不能分享",
  PAUSE: "建议先暂停",
  ALLOW: "",
})[props.modelValue.safetyDisposition]);

function isOptionalField(key: string) {
  return props.modelValue.mode === "BOUNDARY" && key === "reason";
}

function updateField(key: string, event: Event) {
  const value = (event as unknown as { detail: { value: string } }).detail.value;
  emit("update-field", key, value);
}
</script>

<style scoped lang="scss">
.review-screen { min-height: calc(100vh - 184rpx); padding: 54rpx 44rpx 190rpx; box-sizing: border-box; }
.intro-meta { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.eyebrow { color: #bd4933; font-size: 22rpx; font-weight: 800; letter-spacing: .12em; }
.step-pill { padding: 9rpx 16rpx; border: 1rpx solid rgba(49,91,71,.18); border-radius: 999rpx; background: rgba(255,253,248,.62); color: #526c60; font-size: 20rpx; font-weight: 700; }
.title { display: block; margin-top: 22rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 50rpx; font-weight: 700; line-height: 1.32; }
.description { display: block; margin-top: 15rpx; color: #68736f; font-size: 27rpx; line-height: 1.75; }
.safety-note { display: flex; flex-direction: column; gap: 8rpx; margin-top: 25rpx; padding: 20rpx 22rpx; border-left: 5rpx solid #c6533d; border-radius: 0 18rpx 18rpx 0; background: #fae8e2; color: #785148; font-size: 24rpx; line-height: 1.55; }
.safety-title { color: #9e3f2e; font-weight: 800; }
.safety-action { align-self: flex-start; min-height: 48px; margin: 3rpx 0 0; padding: 0; background: transparent; color: #9e3f2e; font-size: 23rpx; font-weight: 800; line-height: 48px; }
.safety-action::after { border: 0; }
.context-bar { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-top: 30rpx; padding: 16rpx 18rpx; border-radius: 20rpx; background: #e3ece5; }
.path-copy { display: flex; flex-wrap: wrap; gap: 12rpx; color: #758079; font-size: 21rpx; }
.path-copy text:last-child { color: #2d5947; font-weight: 800; }
.context-actions { display: flex; gap: 4rpx; }
.context-actions button { min-height: 48px; margin: 0; padding: 0 12rpx; background: transparent; color: #a74432; font-size: 23rpx; line-height: 48px; }
.context-actions button::after { border: 0; }
.private-source { margin-top: 14rpx; padding: 22rpx; border: 1rpx dashed #c8c3b8; border-radius: 18rpx; background: rgba(255,253,248,.58); }
.private-source-meta { display: flex; justify-content: space-between; color: #315b49; font-size: 20rpx; font-weight: 800; }
.private-source-meta text:last-child { color: #8b928e; font-weight: 500; }
.private-source-copy { display: block; margin-top: 12rpx; color: #66716b; font-size: 25rpx; line-height: 1.65; white-space: pre-wrap; }
.single-card { margin-top: 28rpx; padding: 30rpx; border: 1rpx solid #d4d0c5; border-radius: 28rpx; background: rgba(255,253,248,.78); box-shadow: 0 18rpx 45rpx rgba(35,48,41,.06); }
.card-heading { display: flex; gap: 20rpx; }
.card-number { padding-top: 5rpx; color: #bd4b36; font-family: Georgia, serif; font-size: 22rpx; }
.card-title-group { min-width: 0; flex: 1; }
.card-title-line { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.card-label { color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 35rpx; font-weight: 700; }
.field-status { flex: none; color: #7e8983; font-size: 19rpx; }
.card-prompt { display: block; margin-top: 8rpx; color: #718078; font-size: 24rpx; line-height: 1.55; }
.card-input { box-sizing: border-box; width: 100%; min-height: 300rpx; margin-top: 24rpx; padding: 24rpx; border: 1rpx solid rgba(100,112,106,.12); border-radius: 20rpx; background: #faf8f2; color: #233a32; font-size: 28rpx; line-height: 1.7; }
.input-meta { display: flex; justify-content: space-between; gap: 20rpx; margin-top: 11rpx; color: #8c918c; font-size: 20rpx; }
.share-summary { margin-top: 28rpx; }
.summary-heading { display: flex; justify-content: space-between; margin: 0 3rpx 13rpx; color: #69756f; font-size: 21rpx; }
.summary-heading text:first-child { color: #b24733; font-weight: 800; }
.summary-list { overflow: hidden; border: 1rpx solid #d7d2c8; border-radius: 24rpx; background: rgba(255,253,248,.78); }
.summary-row { width: 100%; min-height: 128rpx; margin: 0; padding: 21rpx 22rpx; display: flex; align-items: flex-start; gap: 17rpx; border-radius: 0; background: transparent; color: #233a32; text-align: left; }
.summary-row + .summary-row { border-top: 1rpx solid #e5e0d7; }
.summary-row::after { border: 0; }
.summary-index { padding-top: 3rpx; color: #b84a35; font-family: Georgia, serif; font-size: 19rpx; }
.summary-copy { min-width: 0; flex: 1; }
.summary-copy text { display: block; color: #5f6c66; font-size: 24rpx; line-height: 1.55; }
.summary-copy .summary-label { margin-bottom: 6rpx; color: #1e3b30; font-size: 27rpx; font-weight: 800; }
.summary-edit { flex: none; padding-top: 3rpx; color: #a74432; font-size: 20rpx; }
.privacy-card { display: flex; align-items: flex-start; gap: 17rpx; margin-top: 20rpx; padding: 23rpx; border-radius: 20rpx; background: #e6eee7; color: #64716b; font-size: 23rpx; line-height: 1.6; }
.privacy-mark { display: flex; flex: none; align-items: center; justify-content: center; width: 42rpx; height: 42rpx; border-radius: 50%; background: #315847; color: #fffaf2; font-size: 18rpx; font-weight: 800; }
.privacy-card view { min-width: 0; }
.privacy-card text { display: block; }
.privacy-title { margin-bottom: 5rpx; color: #315847; font-weight: 800; }
@media (max-width: 360px) {
  .review-screen { padding-right: 36rpx; padding-left: 36rpx; }
  .title { font-size: 46rpx; }
  .single-card { padding: 25rpx; }
}
</style>
