<template>
  <view v-if="question" class="clarification-sheet">
    <view class="sheet-top">
      <view class="ai-mark">AI</view>
      <view class="sheet-heading">
        <text class="sheet-kicker">AI 还想听清一件事</text>
        <text class="sheet-progress">第 {{ turnCount + 1 }} 次补充 · 最多 {{ maxTurns }} 次</text>
      </view>
    </view>

    <text class="question">{{ question }}</text>
    <text class="question-note">不用一次说完整，只回答你愿意补充的部分。</text>

    <textarea
      class="answer"
      :value="answer"
      :maxlength="1200"
      placeholder="把你记得的背景告诉 AI，例如当时发生了什么、你最在意什么……"
      @input="updateAnswer"
    />
    <view class="answer-meta">
      <text>仅用于这次私人整理，不会原样分享给对方</text>
      <text>{{ answer.length }} / 1200</text>
    </view>

    <view class="sheet-actions">
      <button class="skip" :disabled="busy" @tap="$emit('skip')">先用现在的草稿</button>
      <button class="continue" :disabled="busy || !answer.trim()" @tap="$emit('continue')">
        {{ busy ? "正在重新整理…" : "回答后继续整理" }}
      </button>
    </view>
  </view>

  <view v-else-if="turnCount" class="clarification-complete">
    <view class="complete-mark">✓</view>
    <view>
      <text class="complete-title">AI 已结合你的 {{ turnCount }} 次补充重新整理</text>
      <text class="complete-note">下面仍是草稿，请以你最后确认的文字为准。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  question: string;
  answer: string;
  turnCount: number;
  maxTurns: number;
  busy: boolean;
}>();

const emit = defineEmits<{
  "update:answer": [value: string];
  continue: [];
  skip: [];
}>();

function updateAnswer(event: Event) {
  emit("update:answer", (event as unknown as { detail: { value: string } }).detail.value);
}
</script>

<style scoped lang="scss">
.clarification-sheet { margin-top: 30rpx; padding: 30rpx; border: 1rpx solid #c7d9cc; border-radius: 28rpx; background: linear-gradient(145deg, #edf3ed 0%, #f8f5eb 100%); box-shadow: 0 16rpx 34rpx rgba(34,67,53,.08); }
.sheet-top { display: flex; align-items: center; gap: 18rpx; }
.ai-mark { display: flex; align-items: center; justify-content: center; width: 58rpx; height: 58rpx; border-radius: 50%; background: #24483a; color: #f8f2e8; font-family: Georgia, serif; font-size: 19rpx; letter-spacing: .06em; }
.sheet-heading { display: flex; flex-direction: column; gap: 5rpx; }
.sheet-kicker { color: #2c5745; font-size: 24rpx; font-weight: 800; }
.sheet-progress { color: #7c8b83; font-size: 20rpx; }
.question { display: block; margin-top: 28rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 34rpx; font-weight: 700; line-height: 1.5; }
.question-note { display: block; margin-top: 10rpx; color: #68766f; font-size: 22rpx; line-height: 1.6; }
.answer { box-sizing: border-box; width: 100%; min-height: 180rpx; margin-top: 22rpx; padding: 22rpx 24rpx; border: 1rpx solid #d7d8cf; border-radius: 20rpx; background: rgba(255,255,255,.82); color: #233a32; font-size: 25rpx; line-height: 1.7; }
.answer-meta { display: flex; justify-content: space-between; gap: 18rpx; margin-top: 10rpx; color: #7d8983; font-size: 19rpx; line-height: 1.5; }
.answer-meta text:first-child { flex: 1; }
.sheet-actions { display: flex; align-items: center; gap: 16rpx; margin-top: 24rpx; }
.sheet-actions button { margin: 0; border-radius: 18rpx; font-size: 23rpx; line-height: 2.7; }
.sheet-actions button::after { border: 0; }
.skip { flex: 0 0 auto; padding: 0 12rpx; background: transparent; color: #66736d; }
.continue { flex: 1; background: #d9543b; color: #fffaf3; font-weight: 800; box-shadow: 0 10rpx 22rpx rgba(201,73,51,.16); }
.continue[disabled] { background: #d8d6ce; color: #969b97; box-shadow: none; }
.clarification-complete { display: flex; align-items: center; gap: 18rpx; margin-top: 28rpx; padding: 22rpx 24rpx; border-radius: 22rpx; background: #e5eee7; }
.complete-mark { display: flex; align-items: center; justify-content: center; width: 42rpx; height: 42rpx; border-radius: 50%; background: #315d4b; color: white; font-size: 22rpx; }
.complete-title, .complete-note { display: block; }
.complete-title { color: #2d5545; font-size: 23rpx; font-weight: 800; }
.complete-note { margin-top: 5rpx; color: #748078; font-size: 20rpx; }
@media (max-width: 360px) {
  .sheet-actions { align-items: stretch; flex-direction: column-reverse; }
  .skip, .continue { width: 100%; }
}
</style>
