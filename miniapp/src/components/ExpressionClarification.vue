<template>
  <view class="workspace-screen" :class="{ 'direct-editing': directEditing || shareModalOpen }">
    <view class="workspace-content" :aria-hidden="directEditing || shareModalOpen">
      <view class="discovery-heading">
        <view class="heading-meta"><text class="eyebrow">AI 私人对话</text><text class="privacy-pill">仅自己可见</text></view>
        <text class="title">先说给我听。</text>
        <text class="description">路径和表达卡都留在这段对话里。表达内容确认后，才会生成一张单独的分享卡。</text>
      </view>

    <view v-if="modelValue.safetyDisposition !== 'ALLOW'" class="safety-note">
      <text class="safety-title">{{ safetyLabel }}</text>
      <text>{{ modelValue.safetyMessage || "继续前，请先确认当前情境是否适合分享。" }}</text>
    </view>

    <view class="conversation" aria-live="polite">
      <view class="message-row assistant">
        <view class="ai-avatar">AI</view>
        <view class="message-bubble assistant-bubble"><text>我在这里。先用你自己的话告诉我发生了什么，不需要组织得很完整。</text></view>
      </view>
      <view class="message-row user">
        <view class="message-bubble user-bubble"><text>{{ sourceText }}</text></view>
      </view>

      <template v-for="(turn, index) in turnsBeforeMode" :key="`before-${turn.question}-${index}`">
        <view class="message-row assistant">
          <view class="ai-avatar">AI</view>
          <view class="message-bubble assistant-bubble"><text>{{ turn.question }}</text></view>
        </view>
        <view class="message-row user">
          <view class="message-bubble user-bubble"><text>{{ turn.answer }}</text></view>
        </view>
      </template>

      <view class="message-row assistant">
        <view class="ai-avatar">AI</view>
        <view class="message-bubble assistant-bubble"><text>我已经听清关键内容了。接下来会按你选择的路径，在这里整理成卡片。</text></view>
      </view>
      <view class="selected-path" role="status">
        <view>
          <text class="selected-path-kicker">已选择表达路径</text>
          <text class="selected-path-title">{{ modeTitle }}</text>
          <text class="selected-path-copy">分享前仍然可以更换，原话和私人对话不会发给对方。</text>
        </view>
        <button :disabled="busy || directEditing" @tap="$emit('change-mode')">更换</button>
      </view>
      <view class="message-row user">
        <view class="message-bubble user-bubble"><text>就按「{{ modeTitle }}」帮我整理。</text></view>
      </view>
      <view class="message-row assistant">
        <view class="ai-avatar">AI</view>
        <view class="message-bubble assistant-bubble"><text>好，不用离开这里。我会把卡片直接放在这段对话下面。</text></view>
      </view>

      <view v-if="organizationPending" class="message-row assistant organization-loading" role="status" aria-live="polite">
        <view class="ai-avatar">AI</view>
        <view class="message-bubble assistant-bubble organization-loading-bubble">
          <view class="typing" aria-hidden="true"><text /><text /><text /></view>
          <view>
            <text class="organization-loading-title">AI 正在整理表达卡</text>
            <text class="organization-loading-copy">整理完成后，表达卡会出现在这里。</text>
          </view>
        </view>
      </view>

      <view v-else class="card-message-row">
        <view class="ai-avatar">AI</view>
        <view class="expression-card" aria-label="AI 协助整理的可编辑表达卡">
          <view class="card-heading">
            <view class="card-heading-copy">
              <text class="card-kicker">AI 协助整理</text>
              <text class="card-title">表达卡</text>
              <text class="card-caption">{{ modeTitle }}</text>
            </view>
            <view class="card-heading-actions">
              <text class="card-progress" :class="{ complete: missingRequiredCount === 0 }">{{ completedRequiredCount }} / {{ requiredFieldCount }}</text>
              <text class="draft-state" :class="{ confirmed: expressionConfirmed }">{{ expressionConfirmed ? "已确认" : "AI 草稿 · 未确认" }}</text>
            </view>
          </view>

          <text class="card-intro">我先按你选择的方式整理好了。你可以继续和我说，也可以点开任一项修改。</text>

          <view v-if="organizationFailure" class="organization-status failure" role="alert" aria-live="assertive">
            <text class="status-mark" aria-hidden="true">!</text>
            <view class="status-copy">
              <text class="status-title">AI 这次没有更新表达卡</text><text>{{ organizationFailure }}</text>
              <view class="status-actions">
                <button class="retry-action" :disabled="busy" @tap="$emit('retry')">重新更新</button>
                <button class="edit-action" :disabled="busy" @tap="enterDirectEdit">直接修改卡片</button>
              </view>
            </view>
          </view>
          <view v-else-if="updatedLabels.length" class="organization-status updated" role="status">
            <text class="status-mark" aria-hidden="true">✓</text><text>AI 已根据你的补充更新：{{ updatedLabels.join("、") }}</text>
          </view>

          <view class="card-fields">
            <view v-for="(field, index) in fieldProgress" :key="field.key" class="card-field" :class="{ missing: !field.complete }" role="button" :aria-label="`编辑${field.label}`" @tap="enterDirectEdit">
              <text class="field-index">{{ String(index + 1).padStart(2, "0") }}</text>
              <view class="field-content">
                <view class="field-heading">
                  <view><text class="field-label">{{ field.label }}</text><text class="field-status" :class="{ user: fieldOwnership(field.key) === 'USER_EDITED' }">{{ fieldStatusLabel(field) }}</text></view>
                  <text class="field-edit-hint">编辑 ›</text>
                </view>
                <text v-if="field.value" class="field-value">{{ field.value }}</text>
                <text v-else class="field-placeholder">{{ field.prompt }}</text>
              </view>
            </view>
          </view>

          <text v-if="missingRequiredCount" class="card-note">还有 {{ missingRequiredCount }} 个必要部分待补充。可以回答 AI，也可以直接编辑。</text>
          <text v-else-if="expressionConfirmed" class="card-note ready">表达内容已确认 · 尚未分享。分享前你还会看到单独的分享预览。</text>
          <text v-else class="card-note ready">必要部分都已有内容。确认前不会生成或分享给对方。</text>

          <view class="card-actions">
            <view class="edit-actions">
              <button :disabled="busy" @tap="beginConversationEdit">对话修改</button>
              <button :disabled="busy" @tap="enterDirectEdit">直接编辑</button>
            </view>
            <button
              class="confirm-expression"
              :disabled="busy || missingRequiredCount > 0 || shareBlocked"
              @tap="confirmExpressionContent"
            >{{ expressionConfirmed ? "继续分享" : "确认表达内容" }}</button>
            <text class="confirm-privacy">🔒 {{ expressionConfirmed ? "分享卡尚未发送" : "确认后才会生成独立分享卡" }}</text>
            <text v-if="shareBlocked" class="confirm-blocked">当前安全状态下不能分享，请先更换路径或暂停。</text>
          </view>
        </view>
      </view>

      <template v-for="(turn, index) in turnsAfterMode" :key="`after-${turn.question}-${index}`">
        <view class="message-row assistant">
          <view class="ai-avatar">AI</view>
          <view class="message-bubble assistant-bubble"><text>{{ turn.question }}</text></view>
        </view>
        <view class="message-row user">
          <view class="message-bubble user-bubble"><text>{{ turn.answer }}</text></view>
        </view>
      </template>
      <view v-if="question && !organizationPending" class="message-row assistant">
        <view class="ai-avatar">AI</view>
        <view class="message-bubble assistant-bubble">
          <text>{{ question }}</text>
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
          :focus="composerFocused"
          aria-label="回复 AI"
          :placeholder="question ? '想到哪说到哪，不完整也没关系……' : '点“对话修改”，或直接编辑卡片'"
          @input="updateAnswer"
        />
        <button class="send" :disabled="busy || !question || !answer.trim()" :aria-label="busy ? 'AI 正在整理，暂时不能重复发送' : '发送给 AI'" @tap="$emit('continue')"><text aria-hidden="true">{{ busy ? "…" : "↑" }}</text></button>
      </view>
      <view class="composer-meta" aria-live="polite"><text>🔒 私人补充自动保存，退出后可以继续</text><text v-if="busy">AI 正在整理…</text></view>
    </view>
    <view id="clarification-tail" class="clarification-tail" aria-hidden="true" />
    </view>

    <view v-if="directEditing" class="editor-layer" role="dialog" aria-modal="true" aria-label="直接编辑表达卡" @touchmove.stop>
      <view class="editor-backdrop" aria-hidden="true" @tap="collapseDirectEdit" />
      <view class="editor-card">
        <view class="editor-card-header">
          <view class="editor-card-heading">
            <text class="editor-kicker">私人草稿 · 未分享</text>
            <text class="editor-title">直接编辑表达卡</text>
            <text class="editor-description">修改后会回到对话中，分享卡需要重新生成。</text>
          </view>
          <button class="editor-close" aria-label="取消并关闭编辑卡片" @tap="collapseDirectEdit">×</button>
        </view>

        <scroll-view class="editor-card-body" scroll-y>
          <view class="editor-fields">
            <label v-for="(field, index) in fieldProgress" :key="field.key" class="direct-field">
              <view class="direct-field-label"><text>{{ String(index + 1).padStart(2, "0") }} · {{ field.label }}</text><text>{{ editFieldValue(field.key).length }} / 3000</text></view>
              <text class="field-prompt">{{ field.prompt }}</text>
              <textarea
                class="field-input"
                :value="editFieldValue(field.key)"
                :maxlength="3000"
                :placeholder="field.placeholder"
                :aria-label="`${field.label}卡片内容`"
                @input="updateBufferedField(field.key, $event)"
              />
            </label>
          </view>
        </scroll-view>

        <view class="editor-card-footer">
          <text class="editor-save-hint">保存后会回到原对话，确认前不会分享</text>
          <view class="direct-editor-actions">
            <button class="collapse-edit" @tap="collapseDirectEdit">取消</button>
            <button class="save-edit" @tap="saveDirectEdit">保存修改</button>
          </view>
        </view>
      </view>
    </view>

    <ShareCardModal
      v-model="shareModalOpen"
      :invitation="sharePreview"
      :busy="busy"
      :failure="shareFailure"
      @confirm="$emit('confirm')"
      @return-edit="returnToExpression"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { sanitizeClarificationTurns, type ClarificationTurn } from "../domain/clarification";
import {
  expressionFieldProgress,
  invitationDraftFromExpression,
  invitationDraftIsComplete,
  type EditableExpression,
  type EditableInvitationDraft,
  type ExpressionFieldProgress,
} from "../domain/expression";
import ShareCardModal from "./ShareCardModal.vue";

const props = defineProps<{
  question: string;
  answer: string;
  turns: ClarificationTurn[];
  modeSelectionTurnCount: number;
  busy: boolean;
  sourceText: string;
  modeTitle: string;
  modelValue: EditableExpression;
  organizationPending: boolean;
  organizationFailure: string;
  updatedFieldKeys: string[];
  shareFailure: string;
}>();

const emit = defineEmits<{
  "update:answer": [value: string];
  continue: [];
  retry: [];
  confirm: [];
  "prepare-share": [];
  "prepare-invitation": [value: EditableInvitationDraft];
  "change-mode": [];
  "conversation-edit": [];
  "direct-edit-saved": [];
  "update-field": [key: string, value: string];
  "update-invitation": [key: "title" | "summary", value: string];
}>();

const directEditing = ref(false);
const editBuffer = ref<Record<string, string>>({});
const composerFocused = ref(false);
const expressionConfirmed = ref(false);
const shareModalOpen = ref(false);
const sharePreview = ref({ ...props.modelValue.invitation });
const sanitizedTurns = computed(() => sanitizeClarificationTurns(props.turns));
const splitIndex = computed(() => Math.min(Math.max(0, props.modeSelectionTurnCount), sanitizedTurns.value.length));
const turnsBeforeMode = computed(() => sanitizedTurns.value.slice(0, splitIndex.value));
const turnsAfterMode = computed(() => sanitizedTurns.value.slice(splitIndex.value));
const fieldProgress = computed(() => expressionFieldProgress(props.modelValue));
const requiredFields = computed(() => fieldProgress.value.filter((field) => !field.optional));
const requiredFieldCount = computed(() => requiredFields.value.length);
const completedRequiredCount = computed(() => requiredFields.value.filter((field) => field.complete).length);
const missingRequiredCount = computed(() => requiredFieldCount.value - completedRequiredCount.value);
const shareBlocked = computed(() => ["BLOCK_SHARE", "PAUSE"].includes(props.modelValue.safetyDisposition));
const updatedLabels = computed(() => fieldProgress.value
  .filter((field) => props.updatedFieldKeys.includes(field.key))
  .map((field) => field.label));
const safetyLabel = computed(() => ({
  WARN: "分享前请留意",
  BLOCK_SHARE: "这份内容暂时不能分享",
  PAUSE: "建议先暂停",
  ALLOW: "",
})[props.modelValue.safetyDisposition]);

function eventValue(event: Event) {
  return (event as unknown as { detail: { value: string } }).detail.value;
}

function fieldOwnership(key: string) {
  return props.modelValue.fieldOwnership[key] ?? "EMPTY";
}

function fieldStatusLabel(field: ExpressionFieldProgress) {
  if (fieldOwnership(field.key) === "USER_EDITED") return "你已修改";
  if (field.value) return "AI 草稿";
  return field.optional ? "可选" : "待补充";
}

function initializeEditBuffer() {
  editBuffer.value = { ...props.modelValue.fields };
}

function enterDirectEdit() {
  if (props.busy) return;
  initializeEditBuffer();
  directEditing.value = true;
}

function collapseDirectEdit() {
  directEditing.value = false;
}

function commitBufferedEdits() {
  for (const field of fieldProgress.value) {
    const value = editBuffer.value[field.key] ?? "";
    if (value !== (props.modelValue.fields[field.key] ?? "")) emit("update-field", field.key, value);
  }
}

function saveDirectEdit() {
  commitBufferedEdits();
  expressionConfirmed.value = false;
  directEditing.value = false;
  emit("direct-edit-saved");
}

function editFieldValue(key: string) {
  return editBuffer.value[key] ?? "";
}

function updateBufferedField(key: string, event: Event) {
  const value = eventValue(event);
  editBuffer.value = { ...editBuffer.value, [key]: value };
}

async function beginConversationEdit() {
  expressionConfirmed.value = false;
  emit("conversation-edit");
  await nextTick();
  composerFocused.value = true;
  setTimeout(() => { composerFocused.value = false; }, 300);
}

function updateAnswer(event: Event) {
  emit("update:answer", eventValue(event));
}

function confirmExpressionContent() {
  if (props.busy || missingRequiredCount.value > 0 || shareBlocked.value) return;
  const invitation = invitationDraftIsComplete(props.modelValue.invitation)
    ? props.modelValue.invitation
    : invitationDraftFromExpression(props.modelValue);
  sharePreview.value = { ...invitation };
  if (!invitationDraftIsComplete(props.modelValue.invitation)) emit("prepare-invitation", invitation);
  expressionConfirmed.value = true;
  emit("prepare-share");
  shareModalOpen.value = true;
}

function returnToExpression() {
  shareModalOpen.value = false;
  expressionConfirmed.value = false;
}
</script>

<style scoped lang="scss">
.workspace-screen { min-height: calc(100dvh - 184rpx); padding: 48rpx 38rpx calc(22rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.heading-meta, .card-heading, .card-heading-actions, .field-heading, .composer-tools, .composer-heading, .composer-meta, .direct-field-label, .direct-editor-actions, .editor-card-header { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.eyebrow, .card-kicker, .selected-path-kicker { color: #bd4933; font-size: 20rpx; font-weight: 800; letter-spacing: .1em; }
.privacy-pill { padding: 8rpx 13rpx; border: 1rpx solid rgba(49,91,71,.2); border-radius: 999rpx; color: #315b49; font-size: 18rpx; font-weight: 800; }
.title { display: block; margin-top: 18rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 50rpx; font-weight: 700; line-height: 1.3; }
.description { display: block; margin-top: 13rpx; color: #68736f; font-size: 25rpx; line-height: 1.7; }
.safety-note { margin-top: 22rpx; padding: 20rpx; border-left: 5rpx solid #c6533d; background: #fae8e2; color: #785148; font-size: 22rpx; line-height: 1.55; }
.safety-title { display: block; color: #9e3f2e; font-weight: 800; }
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
.organization-loading-bubble { display: flex; align-items: center; gap: 16rpx; }
.organization-loading-title, .organization-loading-copy { display: block; }
.organization-loading-title { color: #29483b; font-weight: 800; }
.organization-loading-copy { margin-top: 4rpx; color: #6d7772; font-size: 20rpx; }
.selected-path { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; margin-left: 55rpx; padding: 20rpx 22rpx; border: 1rpx solid #c6d5cc; border-radius: 8rpx 22rpx 22rpx 22rpx; background: #e5eee7; }
.selected-path text { display: block; }.selected-path-title { margin-top: 5rpx; color: #183029; font-size: 28rpx; font-weight: 800; }.selected-path-copy { margin-top: 5rpx; color: #68766f; font-size: 19rpx; line-height: 1.5; }
.selected-path button { min-width: 48px; min-height: 48px; margin: 0; padding: 0 15rpx; border-radius: 999rpx; background: #fffdf8; color: #a74432; font-size: 20rpx; font-weight: 800; line-height: 48px; }
.selected-path button::after { border: 0; }
.card-message-row { align-items: flex-start; }
.expression-card { min-width: 0; flex: 1; overflow: hidden; border: 1rpx solid #d4d0c5; border-radius: 8rpx 26rpx 26rpx 26rpx; background: rgba(255,253,248,.96); box-shadow: 0 16rpx 40rpx rgba(35,48,41,.08); }
.card-heading { align-items: flex-start; padding: 23rpx; border-bottom: 1rpx solid #e5e0d7; }.card-heading-copy { min-width: 0; }.card-heading text { display: block; }.card-heading-actions { flex-direction: column; align-items: flex-end; gap: 8rpx; }
.card-title { margin-top: 5rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 36rpx; font-weight: 700; }.card-caption { margin-top: 5rpx; color: #5e6e66; font-size: 20rpx; }
.card-progress { padding: 8rpx 12rpx; border-radius: 999rpx; background: #f7ded7; color: #a54532; font-size: 18rpx; font-weight: 800; }.card-progress.complete { background: #dce9df; color: #315b49; }
.draft-state { padding: 8rpx 12rpx; border-radius: 999rpx; background: #fff0d5; color: #a76517; font-size: 17rpx; font-weight: 800; white-space: nowrap; }.draft-state.confirmed { background: #dce9df; color: #315b49; }.card-intro { display: block; padding: 19rpx 21rpx; border-bottom: 1rpx solid #e5e0d7; color: #53645b; font-size: 20rpx; line-height: 1.65; }
.organization-status { display: flex; align-items: flex-start; gap: 13rpx; padding: 17rpx 20rpx; color: #66726c; font-size: 20rpx; line-height: 1.55; }.organization-status.failure { background: #fae8e2; color: #805146; }.organization-status.updated { background: #e4eee7; color: #365e4d; }
.status-mark { width: 38rpx; height: 38rpx; display: flex; flex: none; align-items: center; justify-content: center; border-radius: 50%; background: #315847; color: #fff; font-weight: 800; }.failure .status-mark { background: #c84b34; }.status-copy { min-width: 0; flex: 1; }.status-title { display: block; color: #29483b; font-weight: 800; }.failure .status-title { color: #9d3f2e; }
.status-actions { display: flex; gap: 12rpx; margin-top: 11rpx; }.status-actions button { min-height: 48px; margin: 0; padding: 0 18rpx; border-radius: 999rpx; font-size: 20rpx; }.retry-action { background: #c94d36; color: #fff; }.edit-action { background: #fffaf4; color: #a74432; }
.card-field { display: flex; align-items: flex-start; gap: 13rpx; min-height: 48px; padding: 19rpx 21rpx; border-left: 5rpx solid transparent; box-sizing: border-box; }.card-field + .card-field { border-top: 1rpx solid #ebe6dd; }.card-field.missing { border-left-color: #d75a42; background: rgba(250,232,226,.3); }.card-field:active { background: #edf2ed; }
.field-index { padding-top: 4rpx; color: #b84a35; font-family: Georgia, serif; font-size: 17rpx; }.field-content { min-width: 0; flex: 1; }.field-heading > view { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 10rpx; }.field-label { color: #1e3b30; font-size: 24rpx; font-weight: 800; }.field-status { color: #7b8580; font-size: 17rpx; }.field-status.user { color: #315b49; font-weight: 800; }.field-edit-hint { color: #a74432; font-size: 18rpx; font-weight: 700; }
.field-value, .field-placeholder, .field-prompt { display: block; margin-top: 7rpx; font-size: 22rpx; line-height: 1.6; white-space: pre-wrap; }.field-value { color: #4f5f57; }.field-placeholder, .field-prompt { color: #8d7973; }
.card-note { display: block; padding: 16rpx 21rpx; border-top: 1rpx solid #e5e0d7; background: #faf0ec; color: #89584d; font-size: 19rpx; line-height: 1.55; }.card-note.ready { background: #e6eee7; color: #4e6b5d; }
.card-actions { padding: 18rpx 21rpx 21rpx; border-top: 1rpx solid #e5e0d7; }.edit-actions { display: flex; justify-content: center; gap: 12rpx; }.edit-actions button { min-width: 110px; min-height: 48px; margin: 0; padding: 0 18rpx; border: 1rpx solid #cbd6cf; border-radius: 999rpx; background: transparent; color: #315847; font-size: 20rpx; font-weight: 800; }.edit-actions button::after { border: 0; }.confirm-expression { width: 100%; min-height: 56px; margin: 17rpx 0 0; border-radius: 999rpx; background: #d9543b; color: #fffaf3; font-size: 23rpx; font-weight: 800; }.confirm-expression[disabled] { background: #dddcd6; color: #868c87; }.confirm-privacy { display: block; margin-top: 12rpx; color: #7b8580; font-size: 18rpx; text-align: center; }.confirm-blocked { display: block; margin-top: 10rpx; color: #a43f2e; font-size: 18rpx; font-weight: 800; text-align: center; }
.editor-layer { position: fixed; z-index: 90; inset: 0; display: flex; align-items: center; justify-content: center; padding: calc(24rpx + env(safe-area-inset-top)) 24rpx calc(24rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.editor-backdrop { position: absolute; inset: 0; background: rgba(23,43,35,.54); backdrop-filter: blur(5rpx); animation: editor-fade-in .18s ease-out both; }
.editor-card { position: relative; z-index: 1; display: flex; flex-direction: column; width: 100%; max-width: 720rpx; max-height: min(88dvh, 1320rpx); overflow: hidden; border: 1rpx solid rgba(255,255,255,.72); border-radius: 34rpx; background: #f8f3ea; box-shadow: 0 36rpx 100rpx rgba(18,37,29,.34); animation: editor-card-in .22s cubic-bezier(.2,.8,.2,1) both; }
.editor-card-header { flex: none; align-items: flex-start; padding: 26rpx 24rpx 22rpx; border-bottom: 1rpx solid #ded7cb; background: rgba(255,253,248,.96); }
.editor-card-heading { min-width: 0; }.editor-kicker { display: block; color: #bd4933; font-size: 18rpx; font-weight: 800; letter-spacing: .1em; }.editor-title { display: block; margin-top: 7rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 34rpx; font-weight: 700; line-height: 1.35; }.editor-description { display: block; margin-top: 7rpx; color: #6c7771; font-size: 19rpx; line-height: 1.55; }
.editor-close { width: 48px; min-width: 48px; height: 48px; min-height: 48px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #ebe6dd; color: #29483b; font-size: 28px; font-weight: 300; line-height: 1; }.editor-close::after { border: 0; }
.editor-card-body { min-height: 0; height: min(62dvh, 900rpx); flex: 1; background: #f8f3ea; }.editor-fields { padding: 0 24rpx 30rpx; }
.direct-field { display: block; padding: 22rpx 0; border-bottom: 1rpx solid #ddd6ca; }.direct-field-label { color: #315847; font-size: 20rpx; font-weight: 800; }.direct-field-label text:last-child { color: #868c87; font-weight: 500; }
.field-input { box-sizing: border-box; width: 100%; min-height: 210rpx; margin-top: 12rpx; padding: 17rpx; border: 2rpx solid #cbc5ba; border-radius: 18rpx; background: #fffdf8; color: #233a32; font-size: 24rpx; line-height: 1.65; }.field-input:focus { border-color: #315847; }
.editor-card-footer { flex: none; padding: 16rpx 24rpx 18rpx; border-top: 1rpx solid #d8d2c7; background: rgba(255,253,248,.98); box-shadow: 0 -12rpx 32rpx rgba(35,48,41,.06); }.editor-save-hint { display: block; margin-bottom: 12rpx; color: #6b7771; font-size: 18rpx; text-align: center; }.direct-editor-actions button { min-height: 52px; margin: 0; border-radius: 999rpx; font-size: 22rpx; font-weight: 800; }.collapse-edit { flex: 1; background: #e6e1d7; color: #4f5c56; }.save-edit { flex: 1.4; background: #d9543b; color: #fffaf3; }
.composer-dock { position: sticky; bottom: 0; margin: 24rpx -8rpx 0; padding: 18rpx 8rpx calc(8rpx + env(safe-area-inset-bottom)); background: linear-gradient(180deg,rgba(243,239,230,0),#f3efe6 20%,#f3efe6); }.composer-tools { color: #7b8580; font-size: 18rpx; }.composer-tools button { min-height: 48px; margin: 0; padding: 0 10rpx; background: transparent; color: #a74432; font-size: 20rpx; line-height: 48px; }.composer-tools button::after { border: 0; }.composer-heading { margin: 2rpx 4rpx 9rpx; color: #858c87; font-size: 18rpx; }.composer-label { color: #315847; font-weight: 800; }
.composer { display: flex; align-items: flex-end; gap: 11rpx; padding: 9rpx 9rpx 9rpx 18rpx; border: 2rpx solid #cbc8bf; border-radius: 28rpx; background: #fffdf9; }.answer { box-sizing: border-box; flex: 1; width: auto; min-height: 48px; max-height: 230rpx; padding: 12rpx 3rpx 10rpx; background: transparent; color: #233a32; font-size: 25rpx; line-height: 1.6; }.send { width: 48px; min-width: 48px; height: 48px; min-height: 48px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #d9543b; color: #fffaf3; font-size: 28px; }.send[disabled] { background: #e2e2dc; color: #929893; }.composer-meta { margin: 8rpx 4rpx 0; color: #7b8580; font-size: 18rpx; }.clarification-tail { height: 2rpx; }
@media (max-width: 360px) { .workspace-screen { padding-right: 30rpx; padding-left: 30rpx; }.title { font-size: 44rpx; }.card-heading { flex-direction: column; }.card-heading-actions { width: 100%; flex-direction: row; align-items: center; }.edit-actions { flex-direction: column; }.edit-actions button { width: 100%; } }
@keyframes editor-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes editor-card-in { from { opacity: 0; transform: translateY(24rpx) scale(.975); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (prefers-reduced-motion: reduce) { .editor-backdrop, .editor-card { animation: none; } }
</style>
