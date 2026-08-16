<template>
  <view class="workspace-screen">
    <view class="intro">
      <view class="intro-meta"><text class="eyebrow">AI 私人对话</text><text class="turn-pill">卡片在对话内更新</text></view>
      <text class="title">边聊，边把话整理清楚。</text>
      <text class="description">AI 会在下面更新同一张表达卡。你可以直接修改任何部分；只有你确认的最终卡片才会分享。</text>
    </view>

    <view v-if="modelValue.safetyDisposition !== 'ALLOW'" class="safety-note">
      <text class="safety-title">{{ safetyLabel }}</text>
      <text>{{ modelValue.safetyMessage || "继续前，请先确认当前情境是否适合分享。" }}</text>
    </view>

    <view class="context-bar">
      <view class="context-copy"><text>当前路径</text><text>{{ modeTitle }}</text></view>
      <view class="context-actions">
        <button aria-label="查看或收起你的原话" @tap="sourceOpen = !sourceOpen">{{ sourceOpen ? "收起原话" : "查看原话" }}</button>
        <button :disabled="busy" @tap="$emit('change-mode')">更换路径</button>
      </view>
    </view>
    <view v-if="sourceOpen" class="private-source">
      <view class="private-source-meta"><text>你的原话</text><text>仅自己可见</text></view>
      <text class="private-source-copy">{{ sourceText }}</text>
    </view>

    <view class="conversation" aria-live="polite">
      <view v-if="!turns.length && !question" class="message-row assistant">
        <view class="ai-avatar">AI</view>
        <view class="message-bubble assistant-bubble"><text>我先根据你刚才说的内容整理一版。卡片出现后，你可以直接修改。</text></view>
      </view>
      <view
        v-for="(message, index) in messages"
        :key="`${message.role}-${index}`"
        class="message-row"
        :class="message.role"
      >
        <view v-if="message.role === 'assistant'" class="ai-avatar">AI</view>
        <view class="message-bubble" :class="`${message.role}-bubble`">
          <view v-if="message.kind === 'typing'" class="typing" aria-label="AI 正在结合你的补充更新表达卡"><text /><text /><text /></view>
          <text v-else>{{ message.content }}</text>
        </view>
      </view>

      <view class="card-message-row">
        <view class="ai-avatar">AI</view>
        <view class="expression-card" aria-label="AI 协助整理的可编辑表达卡">
          <view class="card-heading">
            <view><text class="card-kicker">AI 协助整理</text><text class="card-title">当前表达卡</text><text class="card-caption">{{ modeTitle }} · 还没有分享给对方</text></view>
            <text class="card-progress" :class="{ complete: missingRequiredCount === 0 }">{{ completedRequiredCount }} / {{ requiredFieldCount }}</text>
          </view>

          <view v-if="organizationPending" class="organization-status loading" role="status">
            <text class="status-mark" aria-hidden="true">···</text>
            <view><text class="status-title">AI 正在更新这张卡片</text><text>上一版仍然保留，完成后会在这里更新。</text></view>
          </view>
          <view v-else-if="organizationFailure" class="organization-status failure" role="alert" aria-live="assertive">
            <text class="status-mark" aria-hidden="true">!</text>
            <view class="status-copy">
              <text class="status-title">AI 这次没有更新表达卡</text><text>{{ organizationFailure }}</text>
              <view class="status-actions">
                <button class="retry-action" :disabled="busy" @tap="$emit('retry')">重新更新</button>
                <button class="edit-action" :disabled="busy" @tap="focusFirstIncompleteField">直接修改卡片</button>
              </view>
            </view>
          </view>
          <view v-else-if="updatedLabels.length" class="organization-status updated" role="status">
            <text class="status-mark" aria-hidden="true">✓</text><text>AI 已根据你的补充更新：{{ updatedLabels.join("、") }}</text>
          </view>

          <view class="card-fields">
            <view v-for="(field, index) in fieldProgress" :key="field.key" class="card-field" :class="{ missing: !field.complete }">
              <text class="field-index">{{ String(index + 1).padStart(2, "0") }}</text>
              <view class="field-content">
                <view class="field-heading">
                  <view><text class="field-label">{{ field.label }}</text><text class="field-status" :class="{ user: fieldOwnership(field.key) === 'USER_EDITED' }">{{ fieldStatusLabel(field) }}</text></view>
                  <button class="inline-edit" :aria-label="`${activeFieldKey === field.key ? '收起' : '修改'}${field.label}`" @tap="toggleField(field.key)">{{ activeFieldKey === field.key ? "收起" : "修改" }}</button>
                </view>
                <template v-if="activeFieldKey === field.key">
                  <text class="field-prompt">{{ field.prompt }}</text>
                  <textarea
                    class="field-input"
                    :value="modelValue.fields[field.key]"
                    :maxlength="3000"
                    :placeholder="field.placeholder"
                    :aria-label="`${field.label}卡片内容`"
                    :focus="true"
                    @input="updateField(field.key, $event)"
                  />
                  <view class="field-input-meta"><text>修改自动保留，AI 后续不会静默覆盖</text><text>{{ modelValue.fields[field.key]?.length ?? 0 }} / 3000</text></view>
                  <button class="finish-edit" @tap="activeFieldKey = ''">完成修改</button>
                </template>
                <template v-else>
                  <text v-if="field.value" class="field-value">{{ field.value }}</text>
                  <text v-else class="field-placeholder">{{ field.prompt }}</text>
                </template>
              </view>
            </view>
          </view>

          <text v-if="missingRequiredCount" class="card-note">还有 {{ missingRequiredCount }} 个必要部分待补充。可以回答 AI，也可以直接修改对应字段。</text>
          <text v-else class="card-note ready">必要部分都已有内容。仍可继续补充或直接修改，确认前不会分享。</text>

          <view v-if="missingRequiredCount === 0" class="invitation-inline">
            <view class="invitation-heading">
              <view><text class="invitation-kicker">对方打开邀请时会先看到</text><text class="invitation-title">这次想谈什么</text></view>
              <text class="ai-badge">{{ modelValue.invitation.generatedByAi ? "AI 协助起草" : "待你确认" }}</text>
            </view>
            <label class="invitation-field">
              <view class="invitation-label"><text>邀请标题</text><text>{{ modelValue.invitation.title.length }} / 40</text></view>
              <input class="invitation-title-input" :value="modelValue.invitation.title" :maxlength="40" placeholder="例如：关于睡觉提醒和被关心的方式" aria-label="邀请标题" @input="updateInvitation('title', $event)" />
            </label>
            <label class="invitation-field">
              <view class="invitation-label"><text>给对方的一段说明</text><text>{{ modelValue.invitation.summary.length }} / 300</text></view>
              <textarea class="invitation-summary-input" :value="modelValue.invitation.summary" :maxlength="300" placeholder="说明发生了什么，以及为什么想邀请对方一起说说。" aria-label="给对方的邀请说明" @input="updateInvitation('summary', $event)" />
            </label>
            <text v-if="!invitationComplete" class="invitation-requirement">确认前需要：标题 4—40 字，说明 20—300 字。</text>
            <view class="confirm-area">
              <text>只会分享你确认的表达卡和邀请说明；原话与 AI 对话不会分享。</text>
              <button v-if="canConfirm" class="confirm-card" :disabled="busy" @tap="$emit('confirm')">确认并分享这张表达卡</button>
              <text v-else-if="shareBlocked" class="confirm-blocked">当前安全状态下不能分享，请先更换路径或暂停。</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="composer-dock">
      <view class="composer-tools"><text>卡片和对话会一起保留</text><button :disabled="busy" @tap="$emit('change-mode')">更换表达路径</button></view>
      <view class="composer-heading"><text class="composer-label">回复 AI</text><text>{{ answer.length }} / 1200</text></view>
      <view class="composer" :class="{ 'composer-busy': busy }">
        <textarea
          class="answer"
          :value="answer"
          :maxlength="1200"
          :disabled="!question"
          :auto-height="true"
          aria-label="回复 AI"
          :placeholder="question ? '想到哪说到哪，不完整也没关系……' : '没有待回答的问题，可直接修改或确认卡片'"
          @input="updateAnswer"
        />
        <button class="send" :disabled="busy || !question || !answer.trim()" :aria-label="busy ? 'AI 正在整理，暂时不能重复发送' : '发送给 AI'" @tap="$emit('continue')"><text aria-hidden="true">{{ busy ? "…" : "↑" }}</text></button>
      </view>
      <view class="composer-meta" aria-live="polite"><text>🔒 私人补充自动保存，退出后可以继续</text><text v-if="busy">AI 正在整理…</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { clarificationConversationMessages, type ClarificationTurn } from "../domain/clarification";
import {
  expressionFieldProgress,
  invitationDraftIsComplete,
  type EditableExpression,
  type ExpressionFieldProgress,
} from "../domain/expression";

const props = defineProps<{
  question: string;
  answer: string;
  turns: ClarificationTurn[];
  busy: boolean;
  sourceText: string;
  modeTitle: string;
  modelValue: EditableExpression;
  organizationPending: boolean;
  organizationFailure: string;
  updatedFieldKeys: string[];
}>();

const emit = defineEmits<{
  "update:answer": [value: string];
  continue: [];
  retry: [];
  confirm: [];
  "change-mode": [];
  "update-field": [key: string, value: string];
  "update-invitation": [key: "title" | "summary", value: string];
}>();

const sourceOpen = ref(false);
const activeFieldKey = ref("");
const messages = computed(() => clarificationConversationMessages(props.turns, props.question, props.organizationPending));
const fieldProgress = computed(() => expressionFieldProgress(props.modelValue));
const requiredFields = computed(() => fieldProgress.value.filter((field) => !field.optional));
const requiredFieldCount = computed(() => requiredFields.value.length);
const completedRequiredCount = computed(() => requiredFields.value.filter((field) => field.complete).length);
const missingRequiredCount = computed(() => requiredFieldCount.value - completedRequiredCount.value);
const invitationComplete = computed(() => invitationDraftIsComplete(props.modelValue.invitation));
const shareBlocked = computed(() => ["BLOCK_SHARE", "PAUSE"].includes(props.modelValue.safetyDisposition));
const canConfirm = computed(() => missingRequiredCount.value === 0 && invitationComplete.value && !shareBlocked.value);
const updatedLabels = computed(() => fieldProgress.value
  .filter((field) => props.updatedFieldKeys.includes(field.key))
  .map((field) => field.label));
const safetyLabel = computed(() => ({
  WARN: "分享前请留意",
  BLOCK_SHARE: "这份内容暂时不能分享",
  PAUSE: "建议先暂停",
  ALLOW: "",
})[props.modelValue.safetyDisposition]);

function fieldOwnership(key: string) {
  return props.modelValue.fieldOwnership[key] ?? "EMPTY";
}

function fieldStatusLabel(field: ExpressionFieldProgress) {
  if (fieldOwnership(field.key) === "USER_EDITED") return "你已修改";
  if (field.value) return "AI 草稿";
  return field.optional ? "可选" : "待补充";
}

function toggleField(key: string) {
  activeFieldKey.value = activeFieldKey.value === key ? "" : key;
}

function focusFirstIncompleteField() {
  activeFieldKey.value = fieldProgress.value.find((field) => !field.complete)?.key ?? fieldProgress.value[0]?.key ?? "";
}

function updateAnswer(event: Event) {
  emit("update:answer", (event as unknown as { detail: { value: string } }).detail.value);
}

function updateField(key: string, event: Event) {
  emit("update-field", key, (event as unknown as { detail: { value: string } }).detail.value);
}

function updateInvitation(key: "title" | "summary", event: Event) {
  emit("update-invitation", key, (event as unknown as { detail: { value: string } }).detail.value);
}
</script>

<style scoped lang="scss">
.workspace-screen { min-height: calc(100dvh - 184rpx); padding: 48rpx 38rpx calc(22rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.intro-meta, .context-bar, .context-actions, .card-heading, .field-heading, .invitation-heading, .invitation-label, .composer-tools, .composer-heading, .composer-meta, .field-input-meta { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.eyebrow, .card-kicker, .invitation-kicker { color: #bd4933; font-size: 20rpx; font-weight: 800; letter-spacing: .1em; }
.turn-pill, .ai-badge { padding: 8rpx 13rpx; border: 1rpx solid rgba(49,91,71,.2); border-radius: 999rpx; color: #315b49; font-size: 18rpx; font-weight: 800; }
.title { display: block; margin-top: 18rpx; color: #183029; font-family: "Songti SC", serif; font-size: 50rpx; font-weight: 700; line-height: 1.3; }
.description { display: block; margin-top: 13rpx; color: #68736f; font-size: 25rpx; line-height: 1.7; }
.safety-note { margin-top: 22rpx; padding: 20rpx; border-left: 5rpx solid #c6533d; background: #fae8e2; color: #785148; font-size: 22rpx; line-height: 1.55; }
.safety-title { display: block; color: #9e3f2e; font-weight: 800; }
.context-bar { margin-top: 25rpx; padding: 16rpx 18rpx; border-radius: 20rpx; background: #e3ece5; }
.context-copy { display: flex; flex-wrap: wrap; gap: 10rpx; color: #758079; font-size: 20rpx; }
.context-copy text:last-child { color: #2d5947; font-weight: 800; }
.context-actions button, .inline-edit, .finish-edit, .composer-tools button { min-height: 48px; margin: 0; padding: 0 10rpx; background: transparent; color: #a74432; font-size: 21rpx; line-height: 48px; }
.context-actions button::after, .inline-edit::after, .finish-edit::after, .composer-tools button::after { border: 0; }
.private-source { margin-top: 13rpx; padding: 20rpx; border: 1rpx dashed #c8c3b8; border-radius: 18rpx; background: rgba(255,253,248,.58); }
.private-source-meta { display: flex; justify-content: space-between; color: #315b49; font-size: 19rpx; font-weight: 800; }
.private-source-copy { display: block; margin-top: 10rpx; color: #66716b; font-size: 23rpx; line-height: 1.65; white-space: pre-wrap; }
.conversation { display: flex; flex-direction: column; gap: 20rpx; margin-top: 28rpx; }
.message-row, .card-message-row { display: flex; align-items: flex-end; gap: 11rpx; }
.message-row.assistant { padding-right: 48rpx; }
.message-row.user { justify-content: flex-end; padding-left: 64rpx; }
.ai-avatar { width: 44rpx; height: 44rpx; display: flex; flex: none; align-items: center; justify-content: center; border-radius: 50%; background: #315847; color: #fffaf1; font-family: Georgia, serif; font-size: 14rpx; }
.message-bubble { max-width: 88%; padding: 18rpx 21rpx; box-sizing: border-box; font-size: 25rpx; line-height: 1.65; box-shadow: 0 7rpx 18rpx rgba(37,62,51,.06); }
.assistant-bubble { border-radius: 8rpx 23rpx 23rpx 23rpx; background: #fffdf8; color: #29463b; }
.user-bubble { border-radius: 23rpx 8rpx 23rpx 23rpx; background: #315847; color: #fffaf2; }
.typing { display: flex; gap: 7rpx; min-width: 58rpx; height: 28rpx; align-items: center; }
.typing text { width: 9rpx; height: 9rpx; border-radius: 50%; background: #749083; }
.card-message-row { align-items: flex-start; }
.expression-card { min-width: 0; flex: 1; overflow: hidden; border: 1rpx solid #d4d0c5; border-radius: 8rpx 26rpx 26rpx 26rpx; background: rgba(255,253,248,.94); box-shadow: 0 16rpx 40rpx rgba(35,48,41,.08); }
.card-heading { align-items: flex-start; padding: 23rpx; border-bottom: 1rpx solid #e5e0d7; }
.card-heading text { display: block; }
.card-title { margin-top: 5rpx; color: #183029; font-family: "Songti SC", serif; font-size: 32rpx; font-weight: 700; }
.card-caption { margin-top: 5rpx; color: #7b8580; font-size: 18rpx; }
.card-progress { padding: 8rpx 12rpx; border-radius: 999rpx; background: #f7ded7; color: #a54532; font-size: 18rpx; font-weight: 800; }
.card-progress.complete { background: #dce9df; color: #315b49; }
.organization-status { display: flex; align-items: flex-start; gap: 13rpx; padding: 17rpx 20rpx; color: #66726c; font-size: 20rpx; line-height: 1.55; }
.organization-status.loading { background: #e8eee8; }.organization-status.failure { background: #fae8e2; color: #805146; }.organization-status.updated { background: #e4eee7; color: #365e4d; }
.status-mark { width: 38rpx; height: 38rpx; display: flex; flex: none; align-items: center; justify-content: center; border-radius: 50%; background: #315847; color: #fff; font-weight: 800; }
.failure .status-mark { background: #c84b34; }.status-copy { min-width: 0; flex: 1; }.status-title { display: block; color: #29483b; font-weight: 800; }.failure .status-title { color: #9d3f2e; }
.status-actions { display: flex; gap: 12rpx; margin-top: 11rpx; }.status-actions button { min-height: 48px; margin: 0; padding: 0 18rpx; border-radius: 999rpx; font-size: 20rpx; }.retry-action { background: #c94d36; color: #fff; }.edit-action { background: #fffaf4; color: #a74432; }
.card-field { display: flex; align-items: flex-start; gap: 13rpx; padding: 19rpx 21rpx; border-left: 5rpx solid transparent; }.card-field + .card-field { border-top: 1rpx solid #ebe6dd; }.card-field.missing { border-left-color: #d75a42; background: rgba(250,232,226,.3); }
.field-index { padding-top: 4rpx; color: #b84a35; font-family: Georgia, serif; font-size: 17rpx; }.field-content { min-width: 0; flex: 1; }.field-heading > view { min-width: 0; display: flex; align-items: center; gap: 10rpx; }.field-label { color: #1e3b30; font-size: 24rpx; font-weight: 800; }.field-status { color: #7b8580; font-size: 17rpx; }.field-status.user { color: #315b49; font-weight: 800; }
.field-value, .field-placeholder, .field-prompt { display: block; margin-top: 7rpx; font-size: 22rpx; line-height: 1.6; white-space: pre-wrap; }.field-value { color: #4f5f57; }.field-placeholder, .field-prompt { color: #9a857f; }
.field-input { box-sizing: border-box; width: 100%; min-height: 220rpx; margin-top: 13rpx; padding: 18rpx; border: 1rpx solid #cfc8bc; border-radius: 18rpx; background: #faf8f2; color: #233a32; font-size: 25rpx; line-height: 1.65; }.field-input-meta { margin-top: 8rpx; color: #858c87; font-size: 17rpx; }.finish-edit { display: block; margin-left: auto; }
.card-note { display: block; padding: 16rpx 21rpx; border-top: 1rpx solid #e5e0d7; background: #faf0ec; color: #89584d; font-size: 19rpx; line-height: 1.55; }.card-note.ready { background: #e6eee7; color: #4e6b5d; }
.invitation-inline { padding: 23rpx; border-top: 1rpx solid #e5e0d7; background: linear-gradient(145deg,#fffaf4,#f9ede6); }.invitation-heading { align-items: flex-start; }.invitation-title { display: block; margin-top: 5rpx; color: #183029; font-family: "Songti SC",serif; font-size: 28rpx; font-weight: 700; }.invitation-field { display: block; margin-top: 19rpx; }.invitation-label { margin-bottom: 8rpx; color: #315b49; font-size: 19rpx; font-weight: 800; }.invitation-label text:last-child { color: #8a8f89; font-weight: 500; }
.invitation-title-input, .invitation-summary-input { box-sizing: border-box; width: 100%; border: 1rpx solid #d5cec2; border-radius: 17rpx; background: rgba(255,253,248,.95); color: #20372f; font-size: 24rpx; line-height: 1.6; }.invitation-title-input { min-height: 48px; padding: 0 17rpx; }.invitation-summary-input { min-height: 180rpx; padding: 16rpx 17rpx; }.invitation-requirement { display: block; margin-top: 10rpx; color: #7a625b; font-size: 18rpx; }
.confirm-area { margin-top: 20rpx; padding-top: 18rpx; border-top: 1rpx solid rgba(179,126,107,.2); color: #6c746f; font-size: 19rpx; line-height: 1.55; }.confirm-card { width: 100%; min-height: 56px; margin: 16rpx 0 0; border-radius: 999rpx; background: #d9543b; color: #fffaf3; font-size: 23rpx; font-weight: 800; }.confirm-blocked { display: block; margin-top: 10rpx; color: #a43f2e; font-weight: 800; }
.composer-dock { position: sticky; bottom: 0; margin: 24rpx -8rpx 0; padding: 18rpx 8rpx calc(8rpx + env(safe-area-inset-bottom)); background: linear-gradient(180deg,rgba(243,239,230,0),#f3efe6 20%,#f3efe6); }.composer-tools { color: #7b8580; font-size: 18rpx; }.composer-heading { margin: 2rpx 4rpx 9rpx; color: #858c87; font-size: 18rpx; }.composer-label { color: #315847; font-weight: 800; }
.composer { display: flex; align-items: flex-end; gap: 11rpx; padding: 9rpx 9rpx 9rpx 18rpx; border: 2rpx solid #cbc8bf; border-radius: 28rpx; background: #fffdf9; }.answer { box-sizing: border-box; flex: 1; width: auto; min-height: 48px; max-height: 230rpx; padding: 12rpx 3rpx 10rpx; background: transparent; color: #233a32; font-size: 25rpx; line-height: 1.6; }.send { width: 48px; min-width: 48px; height: 48px; min-height: 48px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #d9543b; color: #fffaf3; font-size: 28px; }.send[disabled] { background: #e2e2dc; color: #929893; }.composer-meta { margin: 8rpx 4rpx 0; color: #7b8580; font-size: 18rpx; }
@media (max-width: 360px) { .workspace-screen { padding-right: 30rpx; padding-left: 30rpx; }.title { font-size: 44rpx; }.context-actions { gap: 0; } }
</style>
