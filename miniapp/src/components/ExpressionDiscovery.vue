<template>
  <view class="discovery-screen" :class="{ 'has-composer': !readOnly && !selectionVisible }">
    <view v-if="role === 'B' && !readOnly" class="invitation-context">
      <view class="invitation-copy">
        <text class="invitation-label">正在回应这次沟通</text>
        <text class="invitation-topic" role="status" aria-live="polite">{{ invitationTopicStatusCopy }}</text>
      </view>
      <button class="invitation-link" :disabled="invitationStatus === 'loading'" @tap="handleInvitationAction">{{ invitationActionCopy }}</button>
    </view>
    <view class="discovery-heading">
      <view class="heading-meta"><text class="eyebrow">AI 私人对话</text><text class="privacy-pill">仅自己可见</text></view>
      <text class="title">{{ readOnly ? '这段话，我还记得。' : '先说给我听。' }}</text>
      <text class="description">{{ readOnly ? '这是当时只有你和 AI 能看到的对话记录。返回后会回到房间现在的进度。' : '不用一次讲完整。我会一次只追问一个关键背景；等我确认已经听清关键内容，再由你选择用哪条路径整理表达卡。' }}</text>
    </view>

    <view v-if="safetyDisposition !== 'ALLOW'" class="safety-note">
      <text class="safety-title">{{ safetyDisposition === 'WARN' ? '继续前请留意' : '建议先保护自己' }}</text>
      <text>{{ safetyMessage }}</text>
    </view>

    <view class="conversation" aria-live="polite">
      <view v-if="restored" class="restore-note" role="status">
        <text class="restore-mark">续</text>
        <view><text class="restore-title">已恢复上次与 AI 的私人对话</text><text class="restore-copy">只有你能看到，可以从上次停下的地方继续。</text></view>
      </view>
      <view class="message-row assistant">
        <view class="ai-avatar">AI</view>
        <view class="message-bubble assistant-bubble">
          <text>{{ openingMessage }}</text>
        </view>
      </view>

      <template v-if="started || thinking || selectionVisible">
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
        <view v-if="thinking || selectionVisible" class="message-row assistant">
          <view class="ai-avatar">AI</view>
          <view class="message-bubble assistant-bubble">
            <view v-if="thinking" class="typing" aria-label="AI 正在思考"><text /><text /><text /></view>
            <text v-else>{{ readyMessage }}</text>
          </view>
        </view>
        <view v-if="selectionVisible && !thinking" class="mode-choice-row">
          <ExpressionModeChooser
            :model-value="selectedMode"
            :disabled="busy"
            inline
            @update:model-value="$emit('selectMode', $event)"
          />
        </view>
      </template>
    </view>

    <view v-if="memoryProposals.length" class="memory-proposals">
      <text class="memory-kicker">由你决定是否留下</text>
      <text class="memory-title">这次有内容值得下次记住</text>
      <text class="memory-description">只有你确认后，AI 才会在以后相似的私人对话中参考。</text>
      <view v-for="item in memoryProposals" :key="item.id" class="memory-proposal">
        <text class="memory-kind">{{ personalMemoryKindLabel[item.kind] }}</text>
        <text class="memory-content">{{ item.content }}</text>
        <text v-if="item.reason" class="memory-reason">{{ item.reason }}</text>
        <view class="memory-actions">
          <button @tap="$emit('decideMemory', item, 'CONFIRM')">记住这条</button>
          <button @tap="$emit('editMemory', item)">修改后记住</button>
          <button @tap="$emit('decideMemory', item, 'REJECT')">只用于这次</button>
        </view>
      </view>
    </view>

    <view v-if="detachedDrafts.length" class="detached-drafts" role="status">
      <text class="detached-title">另一台设备已经继续了这段对话</text>
      <text class="detached-copy">下面是没有发送出去的旧问题草稿。它们不会自动回答现在的问题，请逐条决定：</text>
      <view v-for="(draft, index) in detachedDrafts" :key="`${draft.revision}-${index}`" class="detached-draft">
        <text v-if="draft.question" class="detached-question">当时 AI 问：{{ draft.question }}</text>
        <text class="detached-content">{{ draft.answer }}</text>
        <view class="detached-actions">
          <button @tap="$emit('restoreDetachedDraft', index)">放回输入框，由我确认</button>
          <button class="discard-draft" @tap="$emit('discardDetachedDraft', index)">丢弃这段草稿</button>
        </view>
      </view>
    </view>

    <view v-if="!readOnly && !selectionVisible" class="composer-dock">
      <view
        v-if="failureMessage"
        class="ai-recovery"
        role="alert"
        aria-live="assertive"
      >
        <view class="ai-recovery-heading">
          <text class="ai-recovery-mark" aria-hidden="true">!</text>
          <text class="ai-recovery-title">这次没有收到 AI 回复</text>
        </view>
        <text class="ai-recovery-copy">{{ failureMessage }}</text>
        <text class="ai-recovery-draft">你的内容仍在输入框和本机草稿中。</text>
        <view class="ai-recovery-actions">
          <button class="retry-ai" @tap="$emit('send')">重新让 AI 理解</button>
          <button class="continue-current" @tap="$emit('continueAfterFailure')">按现有内容继续整理</button>
        </view>
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
          :disabled="busy || recording || ready || safetyStopped"
          :auto-height="true"
          :aria-label="started ? '回复 AI' : '告诉 AI 发生了什么'"
          :placeholder="started ? '想到哪说到哪，不完整也没关系……' : '例如：刚才发生了一件事，我在意的是……'"
          @input="updateCurrentValue"
        />
        <button
          class="send"
          :disabled="busy || recording || !currentValue.trim() || (started && (ready || safetyStopped))"
          :aria-label="busy ? 'AI 正在思考' : failureMessage ? '重新让 AI 理解' : '发送给 AI'"
          @tap="$emit('send')"
        ><text aria-hidden="true">{{ busy ? '…' : '↑' }}</text></button>
      </view>
      <view class="composer-meta">
        <view><text class="private-hint">🔒 仅供 AI 私下整理，不会直接分享给对方</text><text class="save-state" :class="`save-${saveState}`" role="status" aria-live="polite">{{ saveStateCopy }}</text></view>
        <text v-if="recording" class="recording-hint">录音中 {{ durationLabel }}</text>
        <text v-else-if="thinking" class="busy-hint">AI 正在理解…</text>
        <text v-else-if="busy" class="busy-hint">正在处理语音…</text>
      </view>
      <button
        v-if="started && !busy && !ready && !safetyStopped && !failureMessage"
        class="skip-action"
        @tap="$emit('finish')"
      >先不继续追问，直接选择表达路径</button>
    </view>
    <view id="discovery-tail" class="discovery-tail" aria-hidden="true" />
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ExpressionModeChooser from "./ExpressionModeChooser.vue";
import type { ClarificationTurn } from "../domain/clarification";
import type { ExpressionMode, SafetyDisposition } from "../domain/expression";
import {
  personalMemoryKindLabel,
  type DetachedDiscoveryDraft,
  type PersonalMemoryItem,
} from "../domain/ai-memory";
import {
  invitationTopicCopy,
  type InvitationContextStatus,
} from "../domain/invitation";

const props = defineProps<{
  sourceText: string;
  answer: string;
  turns: ClarificationTurn[];
  question: string;
  started: boolean;
  ready: boolean;
  modeSelectionOpen: boolean;
  selectedMode: ExpressionMode | null;
  busy: boolean;
  thinking: boolean;
  recording: boolean;
  recordingSeconds: number;
  role: "A" | "B";
  invitationTopic: string;
  invitationStatus: InvitationContextStatus;
  safetyDisposition: SafetyDisposition;
  safetyMessage: string;
  restored: boolean;
  failureMessage: string;
  saveState: "idle" | "local" | "saving" | "saved";
  memoryProposals: PersonalMemoryItem[];
  detachedDrafts: DetachedDiscoveryDraft[];
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  "update:sourceText": [value: string];
  "update:answer": [value: string];
  send: [];
  finish: [];
  selectMode: [mode: ExpressionMode];
  continueAfterFailure: [];
  record: [];
  viewInvitation: [];
  retryInvitation: [];
  decideMemory: [item: PersonalMemoryItem, decision: "CONFIRM" | "REJECT"];
  editMemory: [item: PersonalMemoryItem];
  localChange: [];
  restoreDetachedDraft: [index: number];
  discardDetachedDraft: [index: number];
}>();

const currentValue = computed(() => {
  if (props.thinking) return "";
  return props.started ? props.answer : props.sourceText;
});
const selectionVisible = computed(() => props.modeSelectionOpen || props.ready);
const invitationTopicStatusCopy = computed(() => invitationTopicCopy(props.invitationStatus, props.invitationTopic));
const invitationActionCopy = computed(() => {
  if (props.invitationStatus === "loading") return "读取中";
  if (props.invitationStatus === "error") return "重新读取";
  return "查看邀请";
});
const safetyStopped = computed(() => ["BLOCK_SHARE", "PAUSE"].includes(props.safetyDisposition));
const openingMessage = computed(() => props.role === "B"
  ? "我先听你的版本。你不用回应对方的结论，只说你看到、听到和在意的事情。"
  : "我在这里。先用你自己的话告诉我发生了什么，不需要组织得很完整。");
const readyMessage = computed(() => props.ready
  ? "我已经理解到足够开始整理的程度了。选一个表达路径，我就把这段对话整理成卡片。"
  : "好的，我会按目前这些内容开始整理。先选一个表达路径，之后仍然可以修改。");
const saveStateCopy = computed(() => ({
  idle: "",
  local: "未发送内容仅保存在本机草稿",
  saving: "正在保存这段私人对话…",
  saved: "已同步这段私人对话",
})[props.saveState]);
const durationLabel = computed(() => {
  const minutes = Math.floor(props.recordingSeconds / 60).toString().padStart(2, "0");
  const seconds = (props.recordingSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
});

function handleInvitationAction() {
  if (props.invitationStatus === "error") emit("retryInvitation");
  else emit("viewInvitation");
}

function updateCurrentValue(event: Event) {
  const value = (event as unknown as { detail: { value: string } }).detail.value;
  if (props.started) emit("update:answer", value);
  else emit("update:sourceText", value);
  emit("localChange");
}
</script>

<style scoped lang="scss">
.discovery-screen { min-height: calc(100vh - 184rpx); min-height: calc(100dvh - 184rpx); padding: 48rpx 44rpx calc(22rpx + env(safe-area-inset-bottom)); display: flex; flex-direction: column; box-sizing: border-box; }
.discovery-screen.has-composer { padding-bottom: calc(320rpx + env(safe-area-inset-bottom)); }
.invitation-context { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-bottom: 30rpx; padding: 20rpx 22rpx; border: 1rpx solid #d4ddd5; border-radius: 22rpx; background: #e8eee8; }
.invitation-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 7rpx; }
.invitation-label { color: #6b7c73; font-size: 19rpx; font-weight: 700; letter-spacing: .08em; }
.invitation-topic { overflow: hidden; color: #29483b; font-size: 24rpx; font-weight: 800; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.invitation-link { flex: none; min-height: 48px; margin: 0; padding: 0 18rpx; border-radius: 999rpx; background: #fffdf8; color: #bd4933; font-size: 21rpx; font-weight: 800; }
.invitation-link::after { border-color: rgba(189,73,51,.18); }
.invitation-link[disabled] { opacity: .55; }
.heading-meta { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; }
.eyebrow { color: #bd4933; font-size: 22rpx; font-weight: 800; letter-spacing: .14em; }
.privacy-pill { padding: 8rpx 14rpx; border: 1rpx solid rgba(49,91,71,.18); border-radius: 999rpx; color: #526c60; font-size: 19rpx; font-weight: 700; }
.title { display: block; margin-top: 18rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 54rpx; font-weight: 700; line-height: 1.25; }
.description { display: block; margin-top: 17rpx; color: #67736d; font-size: 25rpx; line-height: 1.7; }
.safety-note { display: flex; flex-direction: column; gap: 8rpx; margin-top: 22rpx; padding: 20rpx 22rpx; border-left: 5rpx solid #c6533d; border-radius: 0 18rpx 18rpx 0; background: #fae8e2; color: #785148; font-size: 22rpx; line-height: 1.55; }
.safety-title { color: #9e3f2e; font-weight: 800; }
.conversation { min-height: 280rpx; padding: 32rpx 0 24rpx; display: flex; flex: 1; flex-direction: column; gap: 22rpx; }
.restore-note { display: flex; align-items: flex-start; gap: 14rpx; padding: 18rpx 20rpx; border: 1rpx solid #cad8cf; border-radius: 20rpx; background: #e7eee8; color: #315847; }
.restore-mark { width: 42rpx; height: 42rpx; display: flex; flex: none; align-items: center; justify-content: center; border-radius: 50%; background: #315847; color: #fffaf2; font-family: "Songti SC", serif; font-size: 18rpx; font-weight: 800; }
.restore-title, .restore-copy { display: block; }
.restore-title { font-size: 22rpx; font-weight: 800; }
.restore-copy { margin-top: 5rpx; color: #687a70; font-size: 19rpx; line-height: 1.55; }
.message-row { display: flex; align-items: flex-end; gap: 12rpx; }
.message-row.assistant { padding-right: 52rpx; }
.message-row.user { justify-content: flex-end; padding-left: 68rpx; }
.ai-avatar { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 46rpx; height: 46rpx; border-radius: 50%; background: #315847; color: #fffaf1; font-family: Georgia, serif; font-size: 15rpx; }
.message-bubble { max-width: 88%; padding: 19rpx 22rpx; box-sizing: border-box; font-size: 27rpx; line-height: 1.65; box-shadow: 0 7rpx 18rpx rgba(37,62,51,.06); }
.assistant-bubble { border-radius: 8rpx 24rpx 24rpx 24rpx; background: #fffdf8; color: #29463b; }
.user-bubble { border-radius: 24rpx 8rpx 24rpx 24rpx; background: #315847; color: #fffaf2; }
.mode-choice-row { margin-left: 58rpx; padding: 2rpx 0 12rpx; }
.typing { display: flex; align-items: center; gap: 7rpx; min-width: 58rpx; height: 28rpx; }
.typing text { width: 9rpx; height: 9rpx; border-radius: 50%; background: #749083; animation: typing-pulse 1.1s infinite ease-in-out; }
.typing text:nth-child(2) { animation-delay: .15s; }
.typing text:nth-child(3) { animation-delay: .3s; }
@keyframes typing-pulse { 0%, 60%, 100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-5rpx); } }
.memory-proposals { margin: 8rpx 0 26rpx; padding: 26rpx 24rpx; border-left: 6rpx solid #d9543b; border-radius: 0 24rpx 24rpx 0; background: #fffaf3; box-shadow: 0 10rpx 30rpx rgba(37,62,51,.06); }
.detached-drafts { display: flex; flex-direction: column; gap: 14rpx; margin: 8rpx 0 26rpx; padding: 24rpx; border: 2rpx solid #d5b36c; border-radius: 24rpx; background: #fff7e4; }
.detached-draft { display: flex; flex-direction: column; gap: 10rpx; padding-top: 14rpx; border-top: 2rpx solid rgba(120,77,18,.14); }
.detached-title { color: #784d12; font-size: 24rpx; font-weight: 700; }
.detached-copy { color: #6e685e; font-size: 21rpx; line-height: 1.6; }
.detached-question { color: #5d574e; font-size: 21rpx; font-weight: 700; line-height: 1.6; }
.detached-content { padding: 16rpx; border-radius: 16rpx; background: rgba(255,255,255,.72); color: #25362e; font-size: 23rpx; line-height: 1.65; }
.detached-actions { display: flex; flex-wrap: wrap; gap: 12rpx; }
.detached-actions button { min-height: 48px; margin: 0; padding: 0 20rpx; border: 0; border-radius: 999rpx; background: #315b47; color: #fffdf8; font-size: 21rpx; }
.detached-actions .discard-draft { border: 2rpx solid #b65340; background: transparent; color: #9f3f2f; }
.memory-kicker, .memory-title, .memory-description, .memory-kind, .memory-content, .memory-reason { display: block; }
.memory-kicker { color: #bd4933; font-size: 18rpx; font-weight: 800; letter-spacing: .12em; }
.memory-title { margin-top: 9rpx; color: #19352c; font-family: "Songti SC", serif; font-size: 31rpx; font-weight: 800; }
.memory-description { margin-top: 8rpx; color: #6b7771; font-size: 20rpx; line-height: 1.55; }
.memory-proposal { margin-top: 20rpx; padding-top: 20rpx; border-top: 1rpx solid #e7ddd2; }
.memory-kind { color: #315847; font-size: 19rpx; font-weight: 800; }
.memory-content { margin-top: 8rpx; color: #203a31; font-size: 24rpx; line-height: 1.55; }
.memory-reason { margin-top: 7rpx; color: #78827d; font-size: 19rpx; line-height: 1.5; }
.memory-actions { margin-top: 14rpx; display: flex; flex-wrap: wrap; gap: 8rpx; }
.memory-actions button { min-height: 48px; margin: 0; padding: 0 18rpx; border-radius: 999rpx; background: #f2eee6; color: #456557; font-size: 20rpx; font-weight: 700; }
.memory-actions button:first-child { background: #315847; color: #fffaf2; }
.memory-actions button::after { border: 0; }
.composer-dock { position: fixed; z-index: 15; bottom: 0; left: 50%; width: 100%; max-width: 560px; max-height: calc(100vh - 92px); max-height: calc(100dvh - 92px); padding: 24rpx 44rpx calc(12rpx + env(safe-area-inset-bottom)); overflow-y: auto; box-sizing: border-box; background: linear-gradient(180deg, rgba(243,239,230,0), #f3efe6 16%, #f3efe6); transform: translateX(-50%); }
.ai-recovery { margin-bottom: 16rpx; padding: 20rpx; border: 2rpx solid #e2a898; border-radius: 22rpx; background: #fff6f1; color: #6f4036; box-shadow: 0 8rpx 22rpx rgba(111,64,54,.08); }
.ai-recovery-heading { display: flex; align-items: center; gap: 10rpx; }
.ai-recovery-mark { width: 34rpx; height: 34rpx; display: flex; flex: none; align-items: center; justify-content: center; border-radius: 50%; background: #bd4933; color: #fffaf3; font-size: 21rpx; font-weight: 900; }
.ai-recovery-title { color: #9f3f2f; font-size: 28rpx; font-weight: 800; }
.ai-recovery-copy, .ai-recovery-draft { display: block; margin-top: 9rpx; font-size: 28rpx; line-height: 1.55; }
.ai-recovery-draft { margin-top: 5rpx; color: #6f766f; }
.ai-recovery-actions { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 16rpx; }
.ai-recovery-actions button { min-height: 48px; margin: 0; padding: 14rpx 20rpx; border-radius: 999rpx; font-size: 28rpx; font-weight: 800; line-height: 1.35; }
.ai-recovery-actions button::after { border: 0; }
.retry-ai { flex: 1 1 220rpx; background: #bd4933; color: #fffaf3; }
.continue-current { flex: 1 1 280rpx; border: 2rpx solid #b76e5c; background: transparent; color: #914332; }
.composer-heading { display: flex; justify-content: space-between; margin: 0 4rpx 10rpx; color: #6f7973; font-size: 24rpx; }
.composer-label { color: #315847; font-weight: 800; }
.composer { display: flex; align-items: flex-end; gap: 10rpx; padding: 9rpx 9rpx 9rpx 12rpx; border: 2rpx solid #cbc8bf; border-radius: 30rpx; background: #fffdf9; box-shadow: 0 10rpx 28rpx rgba(33,60,48,.08); }
.composer:focus-within { border-color: #557765; box-shadow: 0 0 0 5rpx rgba(49,88,71,.09), 0 10rpx 28rpx rgba(33,60,48,.08); }
.composer-busy { border-color: #d7d4ca; background: #faf8f2; }
.voice { width: 48px; min-width: 48px; height: 48px; min-height: 48px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #f1e8de; color: #d9543b; font-size: 22rpx; }
.voice.recording { background: #d9543b; color: #fffaf3; }
.voice::after { border: 0; }
.answer { box-sizing: border-box; flex: 1; width: auto; min-height: 48px; max-height: 230rpx; padding: 13rpx 2rpx 11rpx; background: transparent; color: #233a32; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 32rpx; font-weight: 400; line-height: 1.55; letter-spacing: 0; }
.send { width: 48px; min-width: 48px; height: 48px; min-height: 48px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #d9543b; box-shadow: 0 7rpx 16rpx rgba(217,84,59,.24); color: #fffaf3; font-family: Georgia, serif; font-size: 29px; line-height: 1; }
.send::after { border: 0; }
.send[disabled] { background: #e2e2dc; box-shadow: none; color: #929893; }
.composer-meta { min-height: 40rpx; margin: 9rpx 4rpx 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 14rpx; }
.private-hint { color: #68736d; font-size: 23rpx; line-height: 1.5; }
.save-state { display: block; margin-top: 3rpx; color: #65756d; font-size: 22rpx; line-height: 1.5; }
.save-error { color: #a84231; }
.recording-hint, .busy-hint { flex: none; color: #4f6e5f; font-size: 19rpx; font-weight: 700; }
.skip-action { min-height: 58rpx; margin: 8rpx auto 0; padding: 4rpx 12rpx; background: transparent; color: #7a817d; font-size: 20rpx; text-decoration: underline; text-underline-offset: 6rpx; }
.skip-action::after { border: 0; }
.discovery-tail { width: 1px; height: 1px; }
@media (max-width: 360px) { .discovery-screen { padding-right: 34rpx; padding-left: 34rpx; } .composer-dock { padding-right: 34rpx; padding-left: 34rpx; } .title { font-size: 48rpx; } }
</style>
