<template>
  <view class="clarification-screen">
    <view class="intro">
      <view class="intro-meta">
        <text class="eyebrow">AI 私人对话</text>
        <text class="turn-pill">第 {{ activeTurn }} / {{ maxTurns }} 轮</text>
      </view>
      <text class="title">不用一次说完整。</text>
      <text class="description">AI 每次只追问一个会影响表达准确性的问题。你的回答只用于更新私人草稿，不会原样发给对方。</text>
    </view>

    <view v-if="safetyDisposition !== 'ALLOW'" class="safety-note">
      <text class="safety-title">{{ safetyLabel }}</text>
      <text>{{ safetyMessage || "继续前，请先确认当前情境是否适合分享。" }}</text>
    </view>

    <view class="context-bar">
      <view class="context-copy">
        <text>当前路径</text>
        <text>{{ modeTitle }}</text>
      </view>
      <button class="context-action" aria-label="查看或收起你的原话" @tap="sourceOpen = !sourceOpen">
        {{ sourceOpen ? "收起原话" : "查看原话" }}
      </button>
    </view>
    <view v-if="sourceOpen" class="private-source">
      <view class="private-source-meta"><text>你的原话</text><text>仅自己可见</text></view>
      <text class="private-source-copy">{{ sourceText }}</text>
    </view>

    <view class="conversation" aria-live="polite">
      <view v-if="!turns.length" class="conversation-guide">
        <view class="ai-avatar">AI</view>
        <text>我会先听你说，再根据你的回答继续追问。你也可以随时直接去看草稿。</text>
      </view>
      <view
        v-for="(message, index) in messages"
        :key="`${message.role}-${index}`"
        class="message-row"
        :class="message.role"
      >
        <view v-if="message.role === 'assistant'" class="ai-avatar">AI</view>
        <view class="message-bubble" :class="`${message.role}-bubble`">
          <view v-if="message.kind === 'typing'" class="typing" aria-label="AI 正在结合你的补充更新草稿">
            <text /><text /><text />
          </view>
          <text v-else>{{ message.content }}</text>
        </view>
      </view>
    </view>

    <view class="composer-dock">
      <view class="composer-heading">
        <text class="composer-label">回复 AI</text>
        <text>{{ answer.length }} / 1200</text>
      </view>
      <view class="composer" :class="{ 'composer-busy': busy }">
        <textarea
          class="answer"
          :value="answer"
          :maxlength="1200"
          :disabled="busy"
          :auto-height="true"
          aria-label="回复 AI"
          placeholder="想到哪说到哪，不完整也没关系……"
          @input="updateAnswer"
        />
        <button
          class="send"
          :disabled="busy || !answer.trim()"
          :aria-label="busy ? 'AI 正在整理，暂时不能重复发送' : '发送给 AI'"
          @tap="$emit('continue')"
        >{{ busy ? "AI 整理中" : "发送回复" }}</button>
      </view>
      <text class="private-hint">🔒 私人补充会自动保存；退出后可以继续。</text>
      <view class="secondary-actions">
        <button class="text-action" :disabled="busy" @tap="$emit('finish')">不再补充，直接确认草稿</button>
        <button class="text-action subtle" :disabled="busy" @tap="$emit('change-mode')">更换表达路径</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  clarificationConversationMessages,
  type ClarificationTurn,
} from "../domain/clarification";
import type { SafetyDisposition } from "../domain/expression";

const props = defineProps<{
  question: string;
  answer: string;
  turns: ClarificationTurn[];
  maxTurns: number;
  busy: boolean;
  sourceText: string;
  modeTitle: string;
  safetyDisposition: SafetyDisposition;
  safetyMessage: string;
}>();

const sourceOpen = ref(false);
const messages = computed(() => clarificationConversationMessages(
  props.turns,
  props.question,
  props.busy,
));
const activeTurn = computed(() => Math.min(props.turns.length + 1, props.maxTurns));
const safetyLabel = computed(() => ({
  WARN: "分享前请留意",
  BLOCK_SHARE: "这份内容暂时不能分享",
  PAUSE: "建议先暂停",
  ALLOW: "",
})[props.safetyDisposition]);

const emit = defineEmits<{
  "update:answer": [value: string];
  continue: [];
  finish: [];
  "change-mode": [];
}>();

function updateAnswer(event: Event) {
  emit("update:answer", (event as unknown as { detail: { value: string } }).detail.value);
}
</script>

<style scoped lang="scss">
.clarification-screen { min-height: calc(100vh - 184rpx); padding: 54rpx 44rpx calc(36rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.intro-meta { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.eyebrow { color: #bd4933; font-size: 22rpx; font-weight: 800; letter-spacing: .14em; }
.turn-pill { padding: 9rpx 16rpx; border: 1rpx solid rgba(49,91,71,.18); border-radius: 999rpx; background: rgba(255,253,248,.62); color: #526c60; font-size: 20rpx; font-weight: 700; }
.title { display: block; margin-top: 22rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 52rpx; font-weight: 700; line-height: 1.3; }
.description { display: block; margin-top: 14rpx; color: #68736f; font-size: 27rpx; line-height: 1.75; }
.safety-note { display: flex; flex-direction: column; gap: 8rpx; margin-top: 24rpx; padding: 20rpx 22rpx; border-left: 5rpx solid #c6533d; border-radius: 0 18rpx 18rpx 0; background: #fae8e2; color: #785148; font-size: 22rpx; line-height: 1.55; }
.safety-title { color: #9e3f2e; font-weight: 800; }
.context-bar { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-top: 30rpx; padding: 18rpx 20rpx; border-radius: 20rpx; background: #e4ece5; }
.context-copy { display: flex; flex-wrap: wrap; gap: 12rpx; color: #758079; font-size: 21rpx; }
.context-copy text:last-child { color: #2d5947; font-weight: 800; }
.context-action, .text-action { min-height: 48px; margin: 0; padding: 0 10rpx; background: transparent; color: #a74432; font-size: 23rpx; line-height: 48px; }
.context-action::after, .text-action::after { border: 0; }
.private-source { margin-top: 14rpx; padding: 22rpx; border: 1rpx dashed #c8c3b8; border-radius: 18rpx; background: rgba(255,253,248,.58); }
.private-source-meta { display: flex; justify-content: space-between; color: #315b49; font-size: 20rpx; font-weight: 800; }
.private-source-meta text:last-child { color: #8b928e; font-weight: 500; }
.private-source-copy { display: block; margin-top: 12rpx; color: #66716b; font-size: 25rpx; line-height: 1.65; white-space: pre-wrap; }
.conversation { display: flex; flex-direction: column; gap: 22rpx; margin-top: 34rpx; padding-bottom: 20rpx; }
.conversation-guide { display: flex; align-items: flex-start; gap: 14rpx; padding-right: 50rpx; color: #718078; font-size: 24rpx; line-height: 1.6; }
.message-row { display: flex; align-items: flex-end; gap: 12rpx; }
.message-row.assistant { padding-right: 56rpx; }
.message-row.user { justify-content: flex-end; padding-left: 70rpx; }
.ai-avatar { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 46rpx; height: 46rpx; border-radius: 50%; background: #315847; color: #fffaf1; font-family: Georgia, serif; font-size: 15rpx; }
.message-bubble { max-width: 88%; padding: 20rpx 23rpx; box-sizing: border-box; font-size: 27rpx; line-height: 1.65; box-shadow: 0 7rpx 18rpx rgba(37,62,51,.06); }
.assistant-bubble { border-radius: 8rpx 24rpx 24rpx 24rpx; background: #fffdf8; color: #29463b; }
.user-bubble { border-radius: 24rpx 8rpx 24rpx 24rpx; background: #315847; color: #fffaf2; }
.typing { display: flex; align-items: center; gap: 7rpx; min-width: 58rpx; height: 28rpx; }
.typing text { width: 9rpx; height: 9rpx; border-radius: 50%; background: #749083; animation: typing-pulse 1.1s infinite ease-in-out; }
.typing text:nth-child(2) { animation-delay: .15s; }
.typing text:nth-child(3) { animation-delay: .3s; }
@keyframes typing-pulse { 0%, 60%, 100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-5rpx); } }
.composer-dock { position: sticky; bottom: 0; margin: 8rpx -10rpx 0; padding: 18rpx 10rpx calc(10rpx + env(safe-area-inset-bottom)); background: linear-gradient(180deg, rgba(243,239,230,0), #f3efe6 20%, #f3efe6); }
.composer-heading { display: flex; justify-content: space-between; margin: 0 4rpx 10rpx; color: #7d8781; font-size: 19rpx; }
.composer-label { color: #315847; font-weight: 800; }
.composer { display: flex; align-items: flex-end; gap: 12rpx; padding: 10rpx 10rpx 10rpx 20rpx; border: 1rpx solid #cbd3cb; border-radius: 24rpx; background: #fffdf9; box-shadow: 0 12rpx 30rpx rgba(33,60,48,.09); }
.composer-busy { opacity: .72; }
.answer { box-sizing: border-box; flex: 1; width: auto; min-height: 48px; max-height: 230rpx; padding: 13rpx 3rpx; background: transparent; color: #233a32; font-size: 27rpx; line-height: 1.6; }
.send { flex: 0 0 auto; min-width: 108rpx; min-height: 48px; margin: 0; padding: 0 16rpx; border-radius: 18rpx; background: #d9543b; color: #fffaf3; font-size: 22rpx; font-weight: 800; line-height: 48px; }
.send::after { border: 0; }
.send[disabled] { background: #d7d8d1; color: #858d88; }
.private-hint { display: block; margin: 10rpx 4rpx 0; color: #7b8580; font-size: 21rpx; line-height: 1.5; }
.secondary-actions { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-top: 4rpx; }
.text-action { flex: 1; color: #a74432; }
.text-action.subtle { color: #6f7974; }
.text-action[disabled] { opacity: .42; }
@media (max-width: 360px) {
  .clarification-screen { padding-right: 36rpx; padding-left: 36rpx; }
  .title { font-size: 46rpx; }
  .secondary-actions { align-items: stretch; flex-direction: column; gap: 0; }
}
</style>
