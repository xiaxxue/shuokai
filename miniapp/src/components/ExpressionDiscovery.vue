<template>
  <view class="discovery-screen">
    <view v-if="role === 'B'" class="invitation-context">
      <view class="invitation-copy">
        <text class="invitation-label">正在回应这次沟通</text>
        <text class="invitation-topic">{{ invitationTopic || "邀请方还需要补充具体背景" }}</text>
      </view>
      <button class="invitation-link" @tap="$emit('viewInvitation')">查看邀请</button>
    </view>
    <view class="discovery-heading">
      <view class="heading-meta"><text class="eyebrow">AI 私人对话</text><text class="privacy-pill">仅自己可见</text></view>
      <text class="title">先说给我听。</text>
      <text class="description">不用一次讲完整。我会一次只追问一个关键背景；等你觉得讲清楚了，再由你选择用哪条路径整理表达卡。</text>
    </view>

    <view v-if="safetyDisposition !== 'ALLOW'" class="safety-note">
      <text class="safety-title">{{ safetyDisposition === 'WARN' ? '继续前请留意' : '建议先保护自己' }}</text>
      <text>{{ safetyMessage }}</text>
    </view>

    <view class="conversation" aria-live="polite">
      <view class="message-row assistant">
        <view class="ai-avatar">AI</view>
        <view class="message-bubble assistant-bubble">
          <text>{{ openingMessage }}</text>
        </view>
      </view>

      <template v-if="started || thinking">
        <view class="message-row user">
          <view class="message-bubble user-bubble"><text>{{ sourceText }}</text></view>
        </view>
        <template v-for="(turn, index) in turns" :key="`${turn.question}-${index}`">
          <view class="message-row assistant">
            <view class="ai-avatar">AI</view>
            <view class="message-bubble assistant-bubble"><text>{{ turn.question }}</text></view>
          </view>
          <view class="message-row user">
            <view class="message-bubble user-bubble"><text>{{ turn.answer }}</text></view>
          </view>
        </template>
        <view v-if="started && question" class="message-row assistant">
          <view class="ai-avatar">AI</view>
          <view class="message-bubble assistant-bubble"><text>{{ question }}</text></view>
        </view>
        <view v-if="thinking && started && answer.trim()" class="message-row user">
          <view class="message-bubble user-bubble"><text>{{ answer }}</text></view>
        </view>
        <view v-if="thinking || ready || followUpLimitReached" class="message-row assistant">
          <view class="ai-avatar">AI</view>
          <view class="message-bubble assistant-bubble">
            <view v-if="thinking" class="typing" aria-label="AI 正在思考"><text /><text /><text /></view>
            <text v-else>{{ ready ? readyMessage : limitMessage }}</text>
          </view>
        </view>
      </template>
    </view>

    <view class="composer-dock">
      <view v-if="(ready || followUpLimitReached) && !busy" class="finish-row">
        <button class="finish-action" @tap="$emit('finish')">
          <text>{{ ready ? '可以开始整理了' : '先按现有内容整理' }}</text>
          <text>选择表达路径 →</text>
        </button>
      </view>
      <view class="composer-heading">
        <text class="composer-label">{{ started ? '回复 AI' : '先讲讲发生了什么' }}</text>
        <text>{{ currentValue.length }} / {{ started ? 1200 : 12000 }}</text>
      </view>
      <view class="composer" :class="{ 'composer-busy': busy }">
        <button
          class="voice"
          :class="{ recording }"
          :disabled="busy"
          :aria-label="recording ? '停止录音' : '开始语音输入'"
          @tap="$emit('record')"
        ><text>{{ recording ? '■' : '●' }}</text></button>
        <textarea
          class="answer"
          :value="currentValue"
          :maxlength="started ? 1200 : 12000"
          :disabled="busy || recording || ready || followUpLimitReached"
          :auto-height="true"
          :aria-label="started ? '回复 AI' : '告诉 AI 发生了什么'"
          :placeholder="started ? '想到哪说到哪，不完整也没关系……' : '例如：刚才发生了一件事，我在意的是……'"
          @input="updateCurrentValue"
        />
        <button
          class="send"
          :disabled="busy || recording || !currentValue.trim() || (started && (ready || followUpLimitReached))"
          :aria-label="busy ? 'AI 正在思考' : '发送给 AI'"
          @tap="$emit('send')"
        ><text aria-hidden="true">{{ busy ? '…' : '↑' }}</text></button>
      </view>
      <view class="composer-meta">
        <text class="private-hint">🔒 仅供 AI 私下整理，不会直接分享给对方</text>
        <text v-if="recording" class="recording-hint">录音中 {{ durationLabel }}</text>
        <text v-else-if="thinking" class="busy-hint">AI 正在理解…</text>
        <text v-else-if="busy" class="busy-hint">正在处理语音…</text>
      </view>
      <button
        v-if="started && !busy && !ready && !followUpLimitReached"
        class="skip-action"
        @tap="$emit('finish')"
      >先不继续追问，直接选择表达路径</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ClarificationTurn } from "../domain/clarification";
import type { SafetyDisposition } from "../domain/expression";

const props = defineProps<{
  sourceText: string;
  answer: string;
  turns: ClarificationTurn[];
  question: string;
  started: boolean;
  ready: boolean;
  followUpLimitReached: boolean;
  busy: boolean;
  thinking: boolean;
  recording: boolean;
  recordingSeconds: number;
  role: "A" | "B";
  invitationTopic: string;
  safetyDisposition: SafetyDisposition;
  safetyMessage: string;
}>();

const emit = defineEmits<{
  "update:sourceText": [value: string];
  "update:answer": [value: string];
  send: [];
  finish: [];
  record: [];
  viewInvitation: [];
}>();

const currentValue = computed(() => props.started ? props.answer : props.sourceText);
const openingMessage = computed(() => props.role === "B"
  ? "我先听你的版本。你不用回应对方的结论，只说你看到、听到和在意的事情。"
  : "我在这里。先用你自己的话告诉我发生了什么，不需要组织得很完整。");
const readyMessage = "我已经理解到足够开始整理的程度了。现在由你选择表达路径，我再把这段对话整理成卡片。";
const limitMessage = "我还有没完全弄清楚的地方，但这轮追问先到这里。我不会假装已经理解完整；你可以先按现有内容整理，之后继续修改。";
const durationLabel = computed(() => {
  const minutes = Math.floor(props.recordingSeconds / 60).toString().padStart(2, "0");
  const seconds = (props.recordingSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
});

function updateCurrentValue(event: Event) {
  const value = (event as unknown as { detail: { value: string } }).detail.value;
  if (props.started) emit("update:answer", value);
  else emit("update:sourceText", value);
}
</script>

<style scoped lang="scss">
.discovery-screen { min-height: calc(100vh - 184rpx); min-height: calc(100dvh - 184rpx); padding: 48rpx 44rpx calc(22rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column; box-sizing: border-box; }
.invitation-context { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-bottom: 30rpx; padding: 20rpx 22rpx; border: 1rpx solid #d4ddd5; border-radius: 22rpx; background: #e8eee8; }
.invitation-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 7rpx; }
.invitation-label { color: #6b7c73; font-size: 19rpx; font-weight: 700; letter-spacing: .08em; }
.invitation-topic { overflow: hidden; color: #29483b; font-size: 24rpx; font-weight: 800; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.invitation-link { flex: none; min-height: 66rpx; margin: 0; padding: 0 18rpx; border-radius: 999rpx; background: #fffdf8; color: #bd4933; font-size: 21rpx; font-weight: 800; }
.invitation-link::after { border-color: rgba(189,73,51,.18); }
.heading-meta { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; }
.eyebrow { color: #bd4933; font-size: 22rpx; font-weight: 800; letter-spacing: .14em; }
.privacy-pill { padding: 8rpx 14rpx; border: 1rpx solid rgba(49,91,71,.18); border-radius: 999rpx; color: #526c60; font-size: 19rpx; font-weight: 700; }
.title { display: block; margin-top: 18rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 54rpx; font-weight: 700; line-height: 1.25; }
.description { display: block; margin-top: 17rpx; color: #67736d; font-size: 25rpx; line-height: 1.7; }
.safety-note { display: flex; flex-direction: column; gap: 8rpx; margin-top: 22rpx; padding: 20rpx 22rpx; border-left: 5rpx solid #c6533d; border-radius: 0 18rpx 18rpx 0; background: #fae8e2; color: #785148; font-size: 22rpx; line-height: 1.55; }
.safety-title { color: #9e3f2e; font-weight: 800; }
.conversation { min-height: 280rpx; padding: 32rpx 0 24rpx; display: flex; flex: 1; flex-direction: column; gap: 22rpx; }
.message-row { display: flex; align-items: flex-end; gap: 12rpx; }
.message-row.assistant { padding-right: 52rpx; }
.message-row.user { justify-content: flex-end; padding-left: 68rpx; }
.ai-avatar { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 46rpx; height: 46rpx; border-radius: 50%; background: #315847; color: #fffaf1; font-family: Georgia, serif; font-size: 15rpx; }
.message-bubble { max-width: 88%; padding: 19rpx 22rpx; box-sizing: border-box; font-size: 27rpx; line-height: 1.65; box-shadow: 0 7rpx 18rpx rgba(37,62,51,.06); }
.assistant-bubble { border-radius: 8rpx 24rpx 24rpx 24rpx; background: #fffdf8; color: #29463b; }
.user-bubble { border-radius: 24rpx 8rpx 24rpx 24rpx; background: #315847; color: #fffaf2; }
.typing { display: flex; align-items: center; gap: 7rpx; min-width: 58rpx; height: 28rpx; }
.typing text { width: 9rpx; height: 9rpx; border-radius: 50%; background: #749083; animation: typing-pulse 1.1s infinite ease-in-out; }
.typing text:nth-child(2) { animation-delay: .15s; }
.typing text:nth-child(3) { animation-delay: .3s; }
@keyframes typing-pulse { 0%, 60%, 100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-5rpx); } }
.composer-dock { position: sticky; bottom: 0; margin: auto -10rpx 0; padding: 16rpx 10rpx calc(8rpx + env(safe-area-inset-bottom)); background: linear-gradient(180deg, rgba(243,239,230,0), #f3efe6 18%, #f3efe6); }
.finish-row { margin-bottom: 16rpx; }
.finish-action { width: 100%; min-height: 84rpx; margin: 0; padding: 16rpx 22rpx; display: flex; align-items: center; justify-content: space-between; border: 1rpx solid #c8d5cc; border-radius: 22rpx; background: #e4ece5; color: #315847; font-size: 23rpx; font-weight: 800; }
.finish-action::after { border: 0; }
.composer-heading { display: flex; justify-content: space-between; margin: 0 4rpx 10rpx; color: #858c87; font-size: 19rpx; }
.composer-label { color: #315847; font-weight: 800; }
.composer { display: flex; align-items: flex-end; gap: 10rpx; padding: 9rpx 9rpx 9rpx 12rpx; border: 2rpx solid #cbc8bf; border-radius: 30rpx; background: #fffdf9; box-shadow: 0 10rpx 28rpx rgba(33,60,48,.08); }
.composer:focus-within { border-color: #557765; box-shadow: 0 0 0 5rpx rgba(49,88,71,.09), 0 10rpx 28rpx rgba(33,60,48,.08); }
.composer-busy { border-color: #d7d4ca; background: #faf8f2; }
.voice { width: 48px; min-width: 48px; height: 48px; min-height: 48px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #f1e8de; color: #d9543b; font-size: 22rpx; }
.voice.recording { background: #d9543b; color: #fffaf3; }
.voice::after { border: 0; }
.answer { box-sizing: border-box; flex: 1; width: auto; min-height: 48px; max-height: 230rpx; padding: 13rpx 2rpx 11rpx; background: transparent; color: #233a32; font-size: 27rpx; line-height: 1.6; }
.send { width: 48px; min-width: 48px; height: 48px; min-height: 48px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #d9543b; box-shadow: 0 7rpx 16rpx rgba(217,84,59,.24); color: #fffaf3; font-family: Georgia, serif; font-size: 29px; line-height: 1; }
.send::after { border: 0; }
.send[disabled] { background: #e2e2dc; box-shadow: none; color: #929893; }
.composer-meta { min-height: 40rpx; margin: 9rpx 4rpx 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 14rpx; }
.private-hint { color: #7b8580; font-size: 19rpx; line-height: 1.5; }
.recording-hint, .busy-hint { flex: none; color: #4f6e5f; font-size: 19rpx; font-weight: 700; }
.skip-action { min-height: 58rpx; margin: 8rpx auto 0; padding: 4rpx 12rpx; background: transparent; color: #7a817d; font-size: 20rpx; text-decoration: underline; text-underline-offset: 6rpx; }
.skip-action::after { border: 0; }
@media (max-width: 360px) { .discovery-screen { padding-right: 34rpx; padding-left: 34rpx; } .title { font-size: 48rpx; } }
</style>
