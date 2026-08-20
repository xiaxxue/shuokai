<template>
  <view v-if="modelValue" class="share-layer" role="dialog" aria-modal="true" :aria-label="dialogTitle" @touchmove.stop>
    <view class="share-backdrop" aria-hidden="true" @tap="close" />
    <view class="share-dialog">
      <button class="share-close" aria-label="暂时关闭分享卡" @tap="close">×</button>

      <template v-if="phase === 'generating'">
        <text class="share-kicker">AI 正在整理</text>
        <text class="share-title">正在生成分享卡</text>
        <text class="share-description">我会把已确认的表达整理成一段给对方看的简短内容。</text>
        <view class="share-skeleton" role="status" aria-live="polite">
          <view class="skeleton-row"><text>标题</text><view class="skeleton-bar short" /></view>
          <view class="skeleton-row"><text>简短说明</text><view><view class="skeleton-bar" /><view class="skeleton-bar medium" /></view></view>
          <view class="loading-dots" aria-hidden="true"><text /><text /><text /></view>
        </view>
        <text class="privacy-line">🔒 原话、AI 对话和完整表达卡不会分享</text>
        <button class="quiet-action" @tap="close">暂时关闭</button>
      </template>

      <template v-else>
        <text v-if="phase !== 'error'" class="share-kicker">对方将看到</text>
        <text class="share-title">{{ dialogTitle }}</text>
        <text v-if="phase === 'preview'" class="share-description">这是根据你刚确认的表达生成的简短内容，发送前请再看一遍。</text>

        <view class="share-preview" aria-label="给对方看的分享卡预览">
          <text class="ai-badge">{{ invitation.generatedByAi ? "✦ AI 整理" : "根据已确认表达生成" }} · 发送前由你确认</text>
          <text class="preview-title">{{ invitation.title }}</text>
          <text class="preview-summary">{{ invitation.summary }}</text>
        </view>

        <view v-if="phase === 'error'" class="share-error" role="alert" aria-live="assertive">
          <text class="error-mark" aria-hidden="true">!</text>
          <view><text class="error-title">分享卡还没有发送</text><text>{{ errorCopy }}</text><text>检查网络后重试，内容不会丢失。</text></view>
        </view>
        <text v-else-if="phase === 'sharing'" class="sharing-status" role="status" aria-live="polite">正在分享，请保持当前页面打开</text>
        <text v-else class="recipient-note">打开后，对方只会看到这段简短内容。</text>

        <text class="privacy-line">🔒 不会分享你的原话、AI 对话和完整表达卡</text>
        <view class="share-actions">
          <button class="secondary-action" :disabled="busy || phase === 'sharing'" @tap="returnToEdit">{{ phase === "error" ? "暂时关闭" : "返回修改" }}</button>
          <button class="primary-action" :disabled="busy || phase === 'sharing'" @tap="confirmShare">
            {{ phase === "sharing" ? "正在分享…" : phase === "error" ? "重新分享" : "确认并分享" }}
          </button>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { EditableInvitationDraft } from "../domain/expression";

const props = defineProps<{
  modelValue: boolean;
  invitation: EditableInvitationDraft;
  busy: boolean;
  failure: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [];
  "return-edit": [];
}>();

type SharePhase = "generating" | "preview" | "sharing" | "error";
const phase = ref<SharePhase>("generating");
let generationTimer: ReturnType<typeof setTimeout> | null = null;

const dialogTitle = computed(() => {
  if (phase.value === "error") return "分享没有完成";
  if (phase.value === "sharing") return "正在分享";
  return "确认分享给对方吗？";
});
const errorCopy = computed(() => props.failure || "网络连接中断，分享卡还没有发送。");

function beginGeneration() {
  if (generationTimer) clearTimeout(generationTimer);
  phase.value = "generating";
  generationTimer = setTimeout(() => {
    phase.value = props.invitation.ready ? "preview" : "error";
    generationTimer = null;
  }, 520);
}

function close() {
  emit("update:modelValue", false);
}

function returnToEdit() {
  if (phase.value === "error") close();
  else emit("return-edit");
}

function confirmShare() {
  phase.value = "sharing";
  emit("confirm");
}

watch(() => props.modelValue, (open) => {
  if (open) beginGeneration();
  else if (generationTimer) {
    clearTimeout(generationTimer);
    generationTimer = null;
  }
}, { immediate: true });

watch(() => props.failure, (failure) => {
  if (props.modelValue && failure) phase.value = "error";
});

onUnmounted(() => {
  if (generationTimer) clearTimeout(generationTimer);
});
</script>

<style scoped lang="scss">
.share-layer { position: fixed; z-index: 100; inset: 0; display: flex; align-items: center; justify-content: center; padding: calc(24rpx + env(safe-area-inset-top)) 28rpx calc(24rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.share-backdrop { position: absolute; inset: 0; background: rgba(18,35,29,.62); backdrop-filter: blur(5rpx); animation: share-fade-in .18s ease-out both; }
.share-dialog { position: relative; z-index: 1; width: 100%; max-width: 680rpx; padding: 36rpx 34rpx 30rpx; box-sizing: border-box; border: 1rpx solid rgba(255,255,255,.72); border-radius: 38rpx; background: #fffdf8; box-shadow: 0 42rpx 110rpx rgba(15,31,25,.38); animation: share-dialog-in .22s cubic-bezier(.2,.8,.2,1) both; }
.share-close { position: absolute; top: 22rpx; right: 22rpx; width: 48px; min-width: 48px; height: 48px; min-height: 48px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #eee9e0; color: #29483b; font-size: 28px; font-weight: 300; line-height: 1; }.share-close::after { border: 0; }
.share-kicker { display: block; padding-right: 96rpx; color: #c84c35; font-size: 20rpx; font-weight: 800; letter-spacing: .08em; }
.share-title { display: block; max-width: 84%; margin-top: 12rpx; color: #18372d; font-family: "Songti SC", "STSong", serif; font-size: 40rpx; font-weight: 700; line-height: 1.35; }
.share-description { display: block; margin-top: 12rpx; color: #68736f; font-size: 21rpx; line-height: 1.65; }
.share-skeleton { margin-top: 28rpx; padding: 26rpx; border: 1rpx solid #dfd9cf; border-radius: 26rpx; background: #fffaf4; }.skeleton-row { display: grid; grid-template-columns: 110rpx 1fr; gap: 18rpx; margin-top: 20rpx; color: #52645b; font-size: 20rpx; font-weight: 700; }.skeleton-row:first-child { margin-top: 0; }.skeleton-bar { height: 18rpx; border-radius: 999rpx; background: linear-gradient(90deg,#e7ebe6,#f5f0e8,#e7ebe6); background-size: 200% 100%; animation: skeleton-pulse 1.2s ease-in-out infinite; }.skeleton-bar + .skeleton-bar { margin-top: 12rpx; }.skeleton-bar.short { width: 68%; }.skeleton-bar.medium { width: 82%; }
.loading-dots { display: flex; justify-content: center; gap: 10rpx; margin-top: 28rpx; }.loading-dots text { width: 10rpx; height: 10rpx; border-radius: 50%; background: #d9543b; opacity: .25; animation: dot-pulse 1s ease-in-out infinite; }.loading-dots text:nth-child(2) { animation-delay: .15s; }.loading-dots text:nth-child(3) { animation-delay: .3s; }
.share-preview { margin-top: 26rpx; padding: 28rpx; border: 1rpx solid #ded8ce; border-radius: 28rpx; background: linear-gradient(145deg,#fffdf8,#fbf3ea); box-shadow: 0 15rpx 38rpx rgba(38,61,51,.08); }.ai-badge { display: inline-flex; padding: 9rpx 14rpx; border-radius: 999rpx; background: #e4eee6; color: #315b49; font-size: 18rpx; font-weight: 800; }.preview-title { display: block; margin-top: 26rpx; color: #21483a; font-family: "Songti SC", "STSong", serif; font-size: 32rpx; font-weight: 700; line-height: 1.45; }.preview-summary { display: block; margin-top: 17rpx; color: #42574e; font-size: 23rpx; line-height: 1.75; white-space: pre-wrap; }
.recipient-note, .sharing-status { display: block; margin-top: 20rpx; color: #6e7873; font-size: 19rpx; line-height: 1.55; }.sharing-status { color: #315b49; font-weight: 800; }
.share-error { display: flex; align-items: flex-start; gap: 14rpx; margin-top: 20rpx; padding: 18rpx; border: 1rpx solid #efd2c8; border-radius: 20rpx; background: #fff3ee; color: #77544b; font-size: 19rpx; line-height: 1.55; }.share-error text { display: block; }.error-mark { width: 40rpx; height: 40rpx; display: flex !important; flex: none; align-items: center; justify-content: center; border-radius: 50%; background: #d9543b; color: #fff; font-weight: 800; }.error-title { color: #9f402f; font-weight: 800; }
.privacy-line { display: block; margin-top: 20rpx; color: #7f8782; font-size: 18rpx; line-height: 1.55; }.share-actions { display: grid; grid-template-columns: .9fr 1.25fr; gap: 14rpx; margin-top: 24rpx; }.share-actions button, .quiet-action { min-height: 54px; margin: 0; border-radius: 999rpx; font-size: 22rpx; font-weight: 800; }.secondary-action, .quiet-action { border: 2rpx solid #315847; background: transparent; color: #315847; }.primary-action { background: #d9543b; color: #fffaf3; }.primary-action[disabled] { opacity: .72; }.quiet-action { width: 100%; margin-top: 22rpx; }
@keyframes share-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes share-dialog-in { from { opacity: 0; transform: translateY(22rpx) scale(.975); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes skeleton-pulse { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
@keyframes dot-pulse { 0%,100% { opacity: .22; transform: scale(.8); } 50% { opacity: 1; transform: scale(1); } }
@media (max-width: 360px) { .share-dialog { padding-right: 26rpx; padding-left: 26rpx; }.share-title { font-size: 35rpx; }.share-actions { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .share-backdrop, .share-dialog, .skeleton-bar, .loading-dots text { animation: none; } }
</style>
