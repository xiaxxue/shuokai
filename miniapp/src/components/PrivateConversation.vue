<template>
  <view class="conversation-screen">
    <view class="conversation-boundary">
      <view class="boundary-dot" />
      <text>私人对话 · 仅自己可见</text>
      <button class="boundary-help" @tap="$emit('privacy')">谁能看到？</button>
    </view>

    <view class="conversation-thread" role="log" aria-live="polite" aria-label="与 AI 的私人对话">
      <view
        v-for="turn in turns"
        :key="turn.id"
        class="conversation-message"
        :class="turn.role === 'USER' ? 'message-user' : 'message-ai'"
      >
        <view class="message-speaker">
          <view class="speaker-dot" />
          <text>{{ turn.role === "USER" ? "我 · 原话" : "说开 AI · 私人回应" }}</text>
        </view>
        <view class="message-paper">
          <text class="message-text">{{ turn.text }}</text>
          <text v-if="turn.supportingText" class="message-support">{{ turn.supportingText }}</text>
        </view>
        <text v-if="turn.role === 'USER'" class="message-saved">已留在私人对话 · 尚未共享</text>
      </view>

      <view v-if="replying" class="conversation-message message-ai" role="status">
        <view class="message-speaker"><view class="speaker-dot" /><text>说开 AI · 正在回应</text></view>
        <view class="message-paper typing-paper" aria-label="AI 正在回应">
          <view class="typing-dot" /><view class="typing-dot" /><view class="typing-dot" />
        </view>
      </view>
    </view>

    <view v-if="hasUserTurns" class="conversation-actions">
      <button
        class="finish-conversation"
        :disabled="busy || recording"
        @tap="$emit('finish')"
      >我讲得差不多了，帮我整理</button>
      <button class="pause-conversation" :disabled="busy" @tap="$emit('pause-room')">暂停这次沟通</button>
    </view>

    <view class="conversation-spacer" />

    <view class="conversation-composer">
      <view class="composer-status">
        <button class="guidance-control" :disabled="busy" @tap="$emit('toggle-guidance')">
          {{ guidancePaused ? "可以继续问我" : "先别问，让我继续说" }}
        </button>
        <text>{{ draftStatus }}</text>
      </view>
      <view class="composer-shell">
        <button
          class="voice-control"
          :class="{ recording }"
          :disabled="busy && !recording"
          :aria-label="recording ? '结束录音' : '开始录音'"
          @tap="$emit('record')"
        >{{ recording ? "停" : "说" }}</button>
        <textarea
          class="composer-input"
          :value="composer"
          :maxlength="1200"
          :disabled="busy || recording"
          :auto-height="true"
          confirm-type="send"
          placeholder="写下你想说的……"
          aria-label="输入你想讲的话"
          @input="updateComposer"
          @confirm="$emit('send')"
        />
        <button
          class="send-control"
          :disabled="busy || recording || !composer.trim()"
          aria-label="发送这一段"
          @tap="$emit('send')"
        >发送</button>
      </view>
      <text v-if="recording" class="recording-status" role="status">
        正在录音 {{ formattedRecordingTime }} · 再点一次结束
      </text>
      <text v-else-if="guidancePaused" class="quiet-status">AI 会先保持安静；你发送的原话仍会保存。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ConversationTurn } from "../domain/conversation";

const props = defineProps<{
  turns: ConversationTurn[];
  composer: string;
  busy: boolean;
  replying: boolean;
  recording: boolean;
  recordingSeconds: number;
  guidancePaused: boolean;
  draftStatus: string;
}>();

const emit = defineEmits<{
  "update:composer": [value: string];
  send: [];
  record: [];
  finish: [];
  privacy: [];
  "toggle-guidance": [];
  "pause-room": [];
}>();

const hasUserTurns = computed(() => props.turns.some((turn) => turn.role === "USER"));
const formattedRecordingTime = computed(() => {
  const minutes = Math.floor(props.recordingSeconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(props.recordingSeconds % 60).toString().padStart(2, "0")}`;
});

function updateComposer(event: Event) {
  emit("update:composer", (event as unknown as { detail: { value: string } }).detail.value);
}
</script>

<style scoped lang="scss">
.conversation-screen {
  position: relative;
  min-height: calc(100vh - 92px);
  min-height: calc(100dvh - 92px);
  padding: 22px 20px 0;
  box-sizing: border-box;
}

.conversation-boundary {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 8px;
  padding: 0 2px 12px;
  border-bottom: 1px solid rgba(49, 91, 71, .14);
  color: #315b47;
  font-size: 12px;
  font-weight: 700;
}

.boundary-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: #315b47;
}

.boundary-help {
  min-width: 76px;
  min-height: 36px;
  margin: 0 0 0 auto;
  padding: 0;
  background: transparent;
  color: #315b47;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.boundary-help::after,
.guidance-control::after,
.pause-conversation::after { border: 0; }

.conversation-thread {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-top: 26px;
}

.conversation-message { display: flex; flex-direction: column; }

.message-speaker {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
  color: #68726c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
}

.speaker-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: #b79043;
}

.message-paper {
  width: fit-content;
  max-width: 92%;
  padding: 14px 16px;
  border: 1px solid #d8d3c8;
  border-radius: 4px 18px 18px 18px;
  background: rgba(255, 253, 248, .88);
  box-sizing: border-box;
  box-shadow: 0 9px 24px rgba(42, 51, 44, .05);
}

.message-text,
.message-support { display: block; white-space: pre-wrap; word-break: break-word; }
.message-text { color: #1c2923; font-size: 15px; line-height: 1.72; }
.message-support { margin-top: 9px; color: #68726c; font-size: 12px; line-height: 1.65; }

.message-user .message-speaker { justify-content: flex-end; }
.message-user .speaker-dot { background: #df5b3f; }
.message-user .message-paper {
  align-self: flex-end;
  border-color: rgba(223, 91, 63, .25);
  border-radius: 18px 4px 18px 18px;
  background: #f3ded5;
}

.message-saved {
  align-self: flex-end;
  margin-top: 6px;
  color: #778079;
  font-size: 10px;
}

.typing-paper {
  min-width: 84px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #315b47;
  animation: conversation-breathe 1.2s ease-in-out infinite;
}

.typing-dot:nth-child(2) { animation-delay: .16s; }
.typing-dot:nth-child(3) { animation-delay: .32s; }

.conversation-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  margin-top: 32px;
}

.finish-conversation {
  width: 100%;
  min-height: 50px;
  border-radius: 10px;
  background: #df5b3f;
  box-shadow: 0 7px 18px rgba(223, 91, 63, .18);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
}

.finish-conversation[disabled] { box-shadow: none; opacity: .38; }

.pause-conversation {
  min-width: 120px;
  min-height: 44px;
  background: transparent;
  color: #68726c;
  font-size: 12px;
}

.conversation-spacer { height: 222px; }

.conversation-composer {
  position: fixed;
  z-index: 18;
  bottom: 0;
  left: 50%;
  width: 100%;
  max-width: 560px;
  padding: 9px 14px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(49, 91, 71, .16);
  background: rgba(243, 239, 230, .97);
  box-sizing: border-box;
  backdrop-filter: blur(14px);
  transform: translateX(-50%);
}

.composer-status {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #78817a;
  font-size: 10px;
}

.guidance-control {
  min-height: 34px;
  margin: 0;
  padding: 0 4px;
  background: transparent;
  color: #315b47;
  font-size: 11px;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.composer-shell {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 48px;
  gap: 8px;
  align-items: end;
  padding: 7px;
  border: 1px solid #d1ccc0;
  border-radius: 24px 8px 24px 8px;
  background: #fffdf8;
  box-shadow: 0 10px 28px rgba(42, 51, 44, .08);
}

.voice-control,
.send-control {
  width: 46px;
  height: 46px;
  min-height: 46px;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 800;
}

.voice-control { background: #dfe9dc; color: #315b47; }
.voice-control.recording { background: #df5b3f; color: #fff; animation: recording-pulse 1.4s ease-in-out infinite; }
.send-control { background: #315b47; color: #fff; }
.send-control[disabled], .voice-control[disabled] { opacity: .38; }

.composer-input {
  width: 100%;
  min-height: 46px;
  max-height: 120px;
  padding: 11px 3px 7px;
  box-sizing: border-box;
  color: #1c2923;
  font-size: 15px;
  line-height: 1.55;
}

.recording-status,
.quiet-status {
  display: block;
  min-height: 22px;
  margin-top: 7px;
  font-size: 11px;
  text-align: center;
}

.recording-status { color: #be442e; }
.quiet-status { color: #68726c; }

@keyframes conversation-breathe {
  50% { opacity: .3; transform: translateY(-2px); }
}

@keyframes recording-pulse {
  50% { box-shadow: 0 0 0 7px rgba(223, 91, 63, .13); }
}

@media (max-width: 350px) {
  .conversation-screen { padding-right: 14px; padding-left: 14px; }
  .conversation-composer { padding-right: 10px; padding-left: 10px; }
  .composer-status { align-items: flex-start; flex-direction: column; gap: 0; padding-bottom: 4px; }
}

@media (prefers-reduced-motion: reduce) {
  .typing-dot,
  .voice-control.recording { animation: none; }
}
</style>
