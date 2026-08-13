<template>
  <view v-if="question || busy" class="clarification-sheet">
    <view class="sheet-top">
      <view class="ai-mark">AI</view>
      <view class="sheet-heading">
        <text class="sheet-kicker">和 AI 一起把背景说清楚</text>
        <text class="sheet-progress">一次只聊一个问题 · 最多 {{ maxTurns }} 轮</text>
      </view>
      <view class="private-badge"><text class="private-dot" />仅自己可见</view>
    </view>

    <view class="conversation" aria-live="polite">
      <view class="message-row assistant intro-row">
        <view class="message-avatar">AI</view>
        <view class="message-bubble assistant-bubble">
          <text>你不用一次说完整。我会根据你的回答继续追问，直到足够整理这份草稿。</text>
        </view>
      </view>
      <view
        v-for="(message, index) in messages"
        :key="`${message.role}-${index}`"
        class="message-row"
        :class="message.role"
      >
        <view v-if="message.role === 'assistant'" class="message-avatar">AI</view>
        <view class="message-bubble" :class="`${message.role}-bubble`">
          <view v-if="message.kind === 'typing'" class="typing" aria-label="AI 正在思考">
            <text /><text /><text />
          </view>
          <text v-else>{{ message.content }}</text>
        </view>
      </view>
    </view>

    <view class="composer" :class="{ 'composer-busy': busy }">
      <textarea
        class="answer"
        :value="answer"
        :maxlength="1200"
        :disabled="busy"
        :auto-height="true"
        placeholder="像聊天一样回复，不完整也没关系……"
        @input="updateAnswer"
      />
      <button
        class="send"
        :disabled="busy || !answer.trim()"
        aria-label="发送回复"
        @tap="$emit('continue')"
      >{{ busy ? "…" : "发送" }}</button>
    </view>
    <view class="answer-meta"><text>回答只用于私人整理，不会原样发给对方</text><text>{{ answer.length }} / 1200</text></view>

    <view class="sheet-actions">
      <button class="skip" :disabled="busy" @tap="$emit('skip')">结束对话，查看现有草稿</button>
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
import { computed } from "vue";
import {
  clarificationConversationMessages,
  type ClarificationTurn,
} from "../domain/clarification";

const props = defineProps<{
  question: string;
  answer: string;
  turns: ClarificationTurn[];
  turnCount: number;
  maxTurns: number;
  busy: boolean;
}>();

const messages = computed(() => clarificationConversationMessages(
  props.turns,
  props.question,
  props.busy,
));

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
.clarification-sheet { margin-top: 30rpx; overflow: hidden; border: 1rpx solid #c7d9cc; border-radius: 28rpx; background: #edf2ec; box-shadow: 0 18rpx 40rpx rgba(34,67,53,.1); }
.sheet-top { display: flex; align-items: center; gap: 16rpx; padding: 26rpx 28rpx; border-bottom: 1rpx solid rgba(72,104,88,.12); background: rgba(250,248,241,.82); }
.ai-mark { display: flex; align-items: center; justify-content: center; width: 58rpx; height: 58rpx; border-radius: 50%; background: #24483a; color: #f8f2e8; font-family: Georgia, serif; font-size: 19rpx; letter-spacing: .06em; }
.sheet-heading { display: flex; flex: 1; flex-direction: column; gap: 5rpx; }
.sheet-kicker { color: #2c5745; font-size: 24rpx; font-weight: 800; }
.sheet-progress { color: #7c8b83; font-size: 20rpx; }
.private-badge { display: flex; align-items: center; gap: 7rpx; color: #718078; font-size: 18rpx; white-space: nowrap; }
.private-dot { width: 11rpx; height: 11rpx; border-radius: 50%; background: #56826e; box-shadow: 0 0 0 5rpx rgba(86,130,110,.12); }
.conversation { display: flex; flex-direction: column; gap: 20rpx; padding: 28rpx; }
.message-row { display: flex; align-items: flex-end; gap: 12rpx; }
.message-row.user { justify-content: flex-end; padding-left: 70rpx; }
.message-row.assistant { padding-right: 54rpx; }
.message-avatar { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 44rpx; height: 44rpx; border-radius: 50%; background: #315847; color: #f8f2e8; font-family: Georgia, serif; font-size: 15rpx; }
.message-bubble { max-width: 86%; padding: 19rpx 22rpx; font-size: 24rpx; line-height: 1.65; box-shadow: 0 6rpx 16rpx rgba(37,62,51,.06); }
.assistant-bubble { border-radius: 8rpx 22rpx 22rpx 22rpx; background: #fffdf8; color: #29463b; }
.user-bubble { border-radius: 22rpx 8rpx 22rpx 22rpx; background: #315847; color: #fffaf2; }
.intro-row .assistant-bubble { color: #61736a; font-size: 22rpx; }
.typing { display: flex; align-items: center; gap: 7rpx; min-width: 56rpx; height: 27rpx; }
.typing text { width: 9rpx; height: 9rpx; border-radius: 50%; background: #749083; animation: typing-pulse 1.1s infinite ease-in-out; }
.typing text:nth-child(2) { animation-delay: .15s; }
.typing text:nth-child(3) { animation-delay: .3s; }
@keyframes typing-pulse { 0%, 60%, 100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-5rpx); } }
.composer { display: flex; align-items: flex-end; gap: 12rpx; margin: 0 24rpx; padding: 12rpx 12rpx 12rpx 20rpx; border: 1rpx solid #cfd7cf; border-radius: 24rpx; background: #fffdf9; box-shadow: 0 10rpx 24rpx rgba(33,60,48,.07); }
.composer-busy { opacity: .68; }
.answer { box-sizing: border-box; flex: 1; width: auto; min-height: 72rpx; max-height: 240rpx; padding: 14rpx 4rpx; background: transparent; color: #233a32; font-size: 24rpx; line-height: 1.6; }
.send { flex: 0 0 auto; width: 88rpx; height: 64rpx; margin: 0; padding: 0; border-radius: 18rpx; background: #d9543b; color: #fffaf3; font-size: 21rpx; font-weight: 800; line-height: 64rpx; }
.send::after { border: 0; }
.send[disabled] { background: #d7d8d1; color: #929893; }
.answer-meta { display: flex; justify-content: space-between; gap: 18rpx; margin: 10rpx 28rpx 0; color: #7d8983; font-size: 18rpx; line-height: 1.5; }
.answer-meta text:first-child { flex: 1; }
.sheet-actions { display: flex; justify-content: center; padding: 14rpx 24rpx 22rpx; }
.sheet-actions button { margin: 0; border-radius: 18rpx; font-size: 23rpx; line-height: 2.7; }
.sheet-actions button::after { border: 0; }
.skip { padding: 0 18rpx; background: transparent; color: #66736d; }
.clarification-complete { display: flex; align-items: center; gap: 18rpx; margin-top: 28rpx; padding: 22rpx 24rpx; border-radius: 22rpx; background: #e5eee7; }
.complete-mark { display: flex; align-items: center; justify-content: center; width: 42rpx; height: 42rpx; border-radius: 50%; background: #315d4b; color: white; font-size: 22rpx; }
.complete-title, .complete-note { display: block; }
.complete-title { color: #2d5545; font-size: 23rpx; font-weight: 800; }
.complete-note { margin-top: 5rpx; color: #748078; font-size: 20rpx; }
@media (max-width: 360px) {
  .sheet-top { align-items: flex-start; flex-wrap: wrap; }
  .private-badge { margin-left: 74rpx; }
  .conversation { padding: 24rpx 20rpx; }
  .message-row.assistant { padding-right: 24rpx; }
}
</style>
