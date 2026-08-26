<template>
  <view class="workspace-screen" :class="{ 'direct-editing': directEditing || shareModalOpen }">
    <view class="workspace-content" :aria-hidden="directEditing || shareModalOpen">
      <view class="conversation-context">
        <view class="context-copy">
          <text class="context-kicker">AI 私人对话</text>
          <text class="context-privacy">🔒 只有你能看到</text>
        </view>
        <button class="change-path" :disabled="busy || shareCompleted" @tap="$emit('change-mode')">更换路径</button>
      </view>

      <view v-if="modelValue.safetyDisposition !== 'ALLOW'" class="safety-note" role="status">
        <text class="safety-title">{{ safetyLabel }}</text>
        <text>{{ modelValue.safetyMessage || "继续前，请先确认当前情境是否适合分享。" }}</text>
      </view>

      <view class="conversation" aria-live="polite">
        <view class="message-row assistant">
          <view class="ai-avatar" aria-hidden="true">AI</view>
          <view class="message-bubble assistant-bubble"><text>我在这里。先用你自己的话告诉我发生了什么，不需要组织得很完整。</text></view>
        </view>
        <view class="message-row user">
          <view class="message-bubble user-bubble"><text>{{ sourceText }}</text></view>
        </view>

        <template v-for="(turn, index) in turnsBeforeMode" :key="`before-${turn.question}-${index}`">
          <view class="message-row assistant">
            <view class="ai-avatar" aria-hidden="true">AI</view>
            <view class="message-bubble assistant-bubble"><text>{{ turn.question }}</text></view>
          </view>
          <view class="message-row user">
            <view class="message-bubble user-bubble"><text>{{ turn.answer }}</text></view>
          </view>
        </template>

        <view class="message-row user mode-confirmation">
          <view class="message-bubble user-bubble"><text>请按「{{ modeTitle }}」帮我整理成表达卡。</text></view>
        </view>
        <view class="message-row assistant">
          <view class="ai-avatar" aria-hidden="true">AI</view>
          <view class="message-bubble assistant-bubble"><text>好的，我会按「{{ modeTitle }}」整理。卡片会继续留在这段对话里。</text></view>
        </view>

        <template v-for="(turn, index) in turnsAfterMode" :key="`after-${turn.question}-${index}`">
          <view class="message-row assistant">
            <view class="ai-avatar" aria-hidden="true">AI</view>
            <view class="message-bubble assistant-bubble"><text>{{ turn.question }}</text></view>
          </view>
          <view class="message-row user">
            <view class="message-bubble user-bubble"><text>{{ turn.answer }}</text></view>
          </view>
        </template>

        <view v-if="organizationPending" class="message-row assistant organization-loading" role="status" aria-live="polite">
          <view class="ai-avatar" aria-hidden="true">AI</view>
          <view class="message-bubble assistant-bubble organization-loading-bubble">
            <view class="typing" aria-hidden="true"><text /><text /><text /></view>
            <view>
              <text class="organization-loading-title">AI 正在整理表达卡</text>
              <text class="organization-loading-copy">整理完成后会直接放在这段对话里。</text>
            </view>
          </view>
        </view>

        <template v-else>
          <view v-if="shareCompleted" class="expression-card shared-card" aria-label="已分享的表达卡">
            <view class="shared-card-heading">
              <view>
                <text class="card-kicker">已由你确认并分享</text>
                <text class="card-title">这张表达卡已送达</text>
                <text class="card-caption">{{ modeTitle }} · 私人对话仍只对你可见</text>
              </view>
              <text class="state-pill confirmed">✓ 已分享</text>
            </view>
            <text class="shared-card-copy">你确认的简短分享卡已经发送；原话、AI 对话和完整草稿没有分享。</text>
          </view>

          <view v-else class="expression-card" :class="{ confirmed: expressionConfirmed }" aria-label="AI 协助整理的可编辑表达卡">
            <view class="card-accent" aria-hidden="true" />
            <view class="card-heading">
              <view class="card-heading-copy">
                <view class="ai-draft-label">
                  <text class="ai-draft-mark" aria-hidden="true">AI</text>
                  <text>AI 整理 · 只有你能看到</text>
                </view>
                <text class="card-title">给你的表达草稿</text>
                <text class="card-caption">按「{{ modeTitle }}」整理，确认前随时可以改</text>
              </view>
              <text class="state-pill" :class="{ confirmed: expressionConfirmed }">{{ expressionConfirmed ? "✓ 已确认" : cardStateLabel }}</text>
            </view>

            <view v-if="!expressionConfirmed" class="draft-overview" aria-label="表达卡整理进度">
              <view class="draft-progress-copy">
                <text>{{ completedRequiredCount }} 项已整理</text>
                <text>{{ missingRequiredCount ? `还差 ${missingRequiredCount} 项` : "可以逐项检查" }}</text>
              </view>
              <view class="draft-progress-track" aria-hidden="true">
                <text
                  v-for="field in requiredFields"
                  :key="`progress-${field.key}`"
                  :class="{ complete: field.complete }"
                />
              </view>
              <text class="card-intro">这是 AI 根据刚才对话提出的草稿，不代表你的最终表达。点开任一段即可修改。</text>
            </view>
            <view v-else class="confirmed-note" role="status">
              <text class="confirmed-mark" aria-hidden="true">✓</text>
              <view><text class="confirmed-title">这版内容已由你确认</text><text>还没有分享。下一步会先让你预览对方将看到的简短分享卡。</text></view>
            </view>

            <view v-if="organizationFailure" class="organization-status failure" role="alert" aria-live="assertive">
              <text class="status-mark" aria-hidden="true">!</text>
              <view class="status-copy">
                <text class="status-title">AI 这次没有更新表达卡</text>
                <text>{{ organizationFailure }}</text>
                <view class="status-actions">
                  <button class="retry-action" :disabled="busy" @tap="$emit('retry')">重新整理</button>
                  <button class="edit-action" :disabled="busy" @tap="enterDirectEdit()">直接修改</button>
                </view>
              </view>
            </view>
            <view v-else-if="updatedLabels.length && !expressionConfirmed" class="organization-status updated" role="status">
              <text class="status-mark" aria-hidden="true">✓</text><text>AI 已更新：{{ updatedLabels.join("、") }}</text>
            </view>

            <view class="card-fields" aria-label="表达卡的四个部分">
              <button
                v-for="(field, index) in fieldProgress"
                :key="field.key"
                class="card-field"
                :class="{ missing: !field.complete }"
                :disabled="busy"
                :aria-label="`编辑${field.label}`"
                @tap="enterDirectEdit(field.key)"
              >
                <view class="field-rail" aria-hidden="true">
                  <text class="field-index">{{ String(index + 1).padStart(2, "0") }}</text>
                  <text class="field-rail-line" />
                </view>
                <view class="field-content">
                  <view class="field-heading">
                    <text class="field-label">{{ field.label }}</text>
                    <text class="field-status" :class="{ user: fieldOwnership(field.key) === 'USER_EDITED' }">{{ expressionConfirmed ? "已确认" : fieldStatusLabel(field) }}</text>
                  </view>
                  <text v-if="field.value" class="field-value">{{ field.value }}</text>
                  <text v-else class="field-placeholder">{{ field.prompt }}</text>
                </view>
                <text class="field-edit-hint" aria-hidden="true">修改</text>
              </button>
            </view>

            <text v-if="missingRequiredCount" class="card-note warning">还有 {{ missingRequiredCount }} 个必要部分没有内容。继续告诉 AI，或点对应段落直接补充。</text>
            <text v-else-if="!expressionConfirmed" class="card-note">四个部分都已整理。请逐段检查，再确认这是你真正想表达的意思。</text>

            <view class="card-actions">
              <template v-if="expressionConfirmed">
                <button class="primary-card-action" :disabled="busy || shareBlocked" @tap="openSharePreview">{{ busy ? "正在生成预览…" : "预览对方将看到的内容" }}</button>
                <button class="secondary-card-action" :disabled="busy" @tap="beginConversationEdit">继续修改这张卡</button>
                <text class="action-privacy">🔒 预览后仍需由你确认，才会分享给对方</text>
              </template>
              <template v-else>
                <view class="draft-actions">
                  <button class="quiet-card-action" :disabled="busy" @tap="beginConversationEdit">继续告诉 AI</button>
                  <text class="draft-action-divider" aria-hidden="true" />
                  <button class="quiet-card-action" :disabled="busy" @tap="enterDirectEdit()">整卡编辑</button>
                </view>
                <button class="primary-card-action" :disabled="busy || missingRequiredCount > 0 || shareBlocked" @tap="confirmExpressionContent">{{ busy ? "AI 正在更新…" : "确认这张表达卡" }}</button>
                <text class="action-privacy">🔒 只有你确认后，才会生成给对方看的版本</text>
              </template>
              <text v-if="shareBlocked" class="confirm-blocked">当前安全状态下不能分享，请先更换路径或暂停。</text>
            </view>
          </view>

          <view v-if="shareCompleted" class="share-success" role="status" aria-live="polite">
            <text class="success-mark" aria-hidden="true">✓</text>
            <view class="success-copy">
              <text class="success-title">分享卡已发送</text>
              <text>对方只会看到你确认过的简短内容，原话和 AI 对话仍然只有你能看到。</text>
            </view>
            <button class="success-action" :disabled="busy" @tap="$emit('continue-after-share')">{{ shareContinuationLabel }}</button>
          </view>
        </template>

        <view v-if="question && !organizationPending && !shareCompleted" class="message-row assistant next-question">
          <view class="ai-avatar" aria-hidden="true">AI</view>
          <view class="message-bubble assistant-bubble"><text>{{ question }}</text></view>
        </view>
      </view>

      <view class="composer-dock">
        <view class="composer-tools">
          <text>{{ shareCompleted ? "表达卡和私人对话都已保留" : "卡片和对话会一起保留" }}</text>
          <button :disabled="busy || shareCompleted" @tap="$emit('change-mode')">更换表达路径</button>
        </view>
        <view class="composer-heading"><text class="composer-label">回复 AI</text><text>{{ answer.length }} / 1200</text></view>
        <view class="composer" :class="{ 'composer-busy': busy }">
          <textarea
            class="answer"
            :value="answer"
            :maxlength="1200"
            :disabled="!question || shareCompleted"
            :auto-height="true"
            :focus="composerFocused"
            aria-label="回复 AI"
            :placeholder="shareCompleted ? '继续下一步后可以进入后续对话' : question ? '想到哪说到哪，不完整也没关系……' : '点“继续告诉 AI”，或直接编辑卡片'"
            @input="updateAnswer"
          />
          <button class="send" :disabled="busy || shareCompleted || !question || !answer.trim()" :aria-label="busy ? 'AI 正在整理，暂时不能重复发送' : '发送给 AI'" @tap="$emit('continue')"><text aria-hidden="true">{{ busy ? "…" : "↑" }}</text></button>
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
            <text class="editor-description">保存后会回到对话中。分享前仍需重新确认。</text>
          </view>
          <button class="editor-close" aria-label="取消并关闭编辑卡片" @tap="collapseDirectEdit">×</button>
        </view>

        <scroll-view class="editor-card-body" scroll-y>
          <view class="editor-fields">
            <label v-for="field in fieldProgress" :key="field.key" class="direct-field">
              <view class="direct-field-label"><text>{{ field.label }}</text><text>{{ editFieldValue(field.key).length }} / 3000</text></view>
              <text class="field-prompt">{{ field.prompt }}</text>
              <textarea
                class="field-input"
                :value="editFieldValue(field.key)"
                :maxlength="3000"
                :focus="editorFocusKey === field.key"
                :placeholder="field.placeholder"
                :aria-label="`${field.label}卡片内容`"
                @input="updateBufferedField(field.key, $event)"
              />
            </label>
          </view>
        </scroll-view>

        <view class="editor-card-footer">
          <text class="editor-save-hint">保存后回到原对话，确认前不会分享</text>
          <view class="direct-editor-actions">
            <button class="collapse-edit" @tap="collapseDirectEdit">取消修改</button>
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
import { computed, nextTick, ref, watch } from "vue";
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
  shareCompleted: boolean;
  shareContinuationLabel: string;
}>();

const emit = defineEmits<{
  "update:answer": [value: string];
  continue: [];
  retry: [];
  confirm: [];
  "continue-after-share": [];
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
const editorFocusKey = ref("");
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
const hasUserEdits = computed(() => fieldProgress.value.some((field) => fieldOwnership(field.key) === "USER_EDITED"));
const cardStateLabel = computed(() => {
  if (expressionConfirmed.value) return "已确认";
  if (hasUserEdits.value) return "已修改 · 待确认";
  return "AI 草稿 · 未确认";
});
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

async function enterDirectEdit(fieldKey = "") {
  if (props.busy || props.shareCompleted) return;
  initializeEditBuffer();
  editorFocusKey.value = "";
  directEditing.value = true;
  if (fieldKey) {
    await nextTick();
    editorFocusKey.value = fieldKey;
  }
}

function collapseDirectEdit() {
  directEditing.value = false;
  editorFocusKey.value = "";
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
  editorFocusKey.value = "";
  emit("direct-edit-saved");
}

function editFieldValue(key: string) {
  return editBuffer.value[key] ?? "";
}

function updateBufferedField(key: string, event: Event) {
  editBuffer.value = { ...editBuffer.value, [key]: eventValue(event) };
}

async function beginConversationEdit() {
  if (props.shareCompleted) return;
  expressionConfirmed.value = false;
  emit("conversation-edit");
  await nextTick();
  composerFocused.value = true;
  setTimeout(() => { composerFocused.value = false; }, 300);
}

function updateAnswer(event: Event) {
  emit("update:answer", eventValue(event));
}

function prepareCurrentInvitation() {
  const invitation = invitationDraftIsComplete(props.modelValue.invitation)
    ? props.modelValue.invitation
    : invitationDraftFromExpression(props.modelValue);
  sharePreview.value = { ...invitation };
  if (!invitationDraftIsComplete(props.modelValue.invitation)) emit("prepare-invitation", invitation);
}

function confirmExpressionContent() {
  if (props.busy || missingRequiredCount.value > 0 || shareBlocked.value) return;
  prepareCurrentInvitation();
  expressionConfirmed.value = true;
  emit("prepare-share");
}

function openSharePreview() {
  if (props.busy || !expressionConfirmed.value || shareBlocked.value) return;
  prepareCurrentInvitation();
  emit("prepare-share");
  shareModalOpen.value = true;
}

function returnToExpression() {
  shareModalOpen.value = false;
}

watch(() => props.modelValue.mode, () => {
  expressionConfirmed.value = false;
  shareModalOpen.value = false;
});

watch(() => props.shareCompleted, (completed) => {
  if (!completed) return;
  expressionConfirmed.value = true;
  shareModalOpen.value = false;
  directEditing.value = false;
});
</script>

<style scoped lang="scss">
.workspace-screen { min-height: calc(100dvh - 92px); padding: 20rpx 26rpx calc(320rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.workspace-content { width: 100%; }
.conversation-context, .context-copy, .card-heading, .field-heading, .composer-tools, .composer-heading, .composer-meta, .direct-field-label, .direct-editor-actions, .editor-card-header, .shared-card-heading { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.conversation-context { min-height: 48px; padding: 0 4rpx 12rpx; border-bottom: 1rpx solid rgba(49,91,71,.12); }
.context-copy { justify-content: flex-start; flex-wrap: wrap; gap: 10rpx; }
.context-kicker { color: #bd4933; font-size: 20rpx; font-weight: 800; letter-spacing: .1em; }
.context-privacy { color: #6c7872; font-size: 18rpx; }
.change-path { min-height: 48px; margin: 0; padding: 0 10rpx; background: transparent; color: #a74432; font-size: 20rpx; font-weight: 800; line-height: 48px; }
.change-path::after { border: 0; }
.safety-note { margin-top: 18rpx; padding: 18rpx 20rpx; border-left: 5rpx solid #c6533d; border-radius: 0 18rpx 18rpx 0; background: #fae8e2; color: #785148; font-size: 21rpx; line-height: 1.55; }
.safety-title { display: block; color: #9e3f2e; font-weight: 800; }
.conversation { display: flex; flex-direction: column; gap: 18rpx; padding-top: 20rpx; }
.message-row { display: flex; align-items: flex-end; gap: 10rpx; }
.message-row.assistant { padding-right: 36rpx; }
.message-row.user { justify-content: flex-end; padding-left: 48rpx; }
.ai-avatar { width: 42rpx; height: 42rpx; display: flex; flex: none; align-items: center; justify-content: center; border-radius: 50%; background: #315847; color: #fffaf1; font-family: Georgia, serif; font-size: 14rpx; }
.message-bubble { max-width: 90%; padding: 17rpx 20rpx; box-sizing: border-box; font-size: 24rpx; line-height: 1.62; box-shadow: 0 7rpx 18rpx rgba(37,62,51,.055); }
.assistant-bubble { border: 1rpx solid rgba(49,91,71,.08); border-radius: 8rpx 22rpx 22rpx 22rpx; background: #fffdf8; color: #29463b; }
.user-bubble { border-radius: 22rpx 8rpx 22rpx 22rpx; background: #315847; color: #fffaf2; }
.mode-confirmation { margin-top: 4rpx; }
.typing { display: flex; gap: 7rpx; min-width: 58rpx; height: 28rpx; align-items: center; }
.typing text { width: 9rpx; height: 9rpx; border-radius: 50%; background: #749083; animation: typing-pulse 1.1s ease-in-out infinite; }
.typing text:nth-child(2) { animation-delay: .15s; }.typing text:nth-child(3) { animation-delay: .3s; }
.organization-loading-bubble { display: flex; align-items: center; gap: 16rpx; }
.organization-loading-title, .organization-loading-copy { display: block; }
.organization-loading-title { color: #29483b; font-weight: 800; }
.organization-loading-copy { margin-top: 4rpx; color: #6d7772; font-size: 19rpx; }
.expression-card { position: relative; overflow: hidden; border: 1rpx solid rgba(41,77,61,.18); border-radius: 30rpx 30rpx 20rpx 20rpx; background: #fdf9f1; box-shadow: 0 22rpx 56rpx rgba(33,57,46,.11); }
.card-accent { height: 8rpx; background: linear-gradient(90deg,#c84b34 0 28%,#e9b7a8 28% 38%,#315847 38% 100%); }
.card-heading { align-items: flex-start; padding: 24rpx 24rpx 18rpx; }
.card-heading-copy { min-width: 0; flex: 1; }
.card-heading-copy text, .shared-card-heading text, .draft-progress-copy text { display: block; }
.ai-draft-label { display: flex; align-items: center; gap: 9rpx; color: #496459; font-size: 12px; font-weight: 800; letter-spacing: .04em; }
.ai-draft-mark { width: 38rpx; height: 38rpx; display: flex !important; align-items: center; justify-content: center; border-radius: 50%; background: #315847; color: #fffaf1; font-family: Georgia, serif; font-size: 13rpx; letter-spacing: 0; }
.card-kicker { color: #bd4933; font-size: 12px; font-weight: 800; letter-spacing: .08em; }
.card-title { margin-top: 10rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 23px; font-weight: 700; line-height: 1.28; }
.card-caption { margin-top: 7rpx; color: #627169; font-size: 12px; line-height: 1.5; }
.state-pill { flex: none; padding: 8rpx 12rpx; border: 1rpx solid #e5c9aa; border-radius: 999rpx; background: #fff3df; color: #91601b; font-size: 11px; font-weight: 800; white-space: nowrap; }
.state-pill.confirmed { border-color: #bfd4c7; background: #e2eee6; color: #315b49; }
.draft-overview { margin: 0 20rpx 18rpx; padding: 18rpx 18rpx 16rpx; border-radius: 20rpx; background: #eef2eb; }
.draft-progress-copy { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; color: #315847; font-size: 12px; font-weight: 800; }
.draft-progress-copy text:last-child { color: #748078; font-weight: 500; }
.draft-progress-track { display: grid; grid-template-columns: repeat(4,1fr); gap: 7rpx; margin-top: 11rpx; }
.draft-progress-track text { height: 6rpx; border-radius: 999rpx; background: #d5d8d0; }
.draft-progress-track text.complete { background: #315847; }
.card-intro { display: block; margin-top: 12rpx; color: #586860; font-size: 13px; line-height: 1.6; }
.confirmed-note { display: flex; align-items: flex-start; gap: 14rpx; margin: 0 20rpx 18rpx; padding: 18rpx; border-radius: 20rpx; background: #e4eee7; color: #52675d; font-size: 19rpx; line-height: 1.55; }
.confirmed-mark, .status-mark, .success-mark { display: flex; flex: none; align-items: center; justify-content: center; border-radius: 50%; background: #315847; color: #fff; font-weight: 800; }
.confirmed-mark { width: 38rpx; height: 38rpx; }.confirmed-note text { display: block; }.confirmed-title { margin-bottom: 4rpx; color: #315847; font-weight: 800; }
.organization-status { display: flex; align-items: flex-start; gap: 13rpx; padding: 17rpx 20rpx; color: #66726c; font-size: 20rpx; line-height: 1.55; }
.organization-status.failure { background: #fae8e2; color: #805146; }.organization-status.updated { background: #e4eee7; color: #365e4d; }
.status-mark { width: 38rpx; height: 38rpx; }.failure .status-mark { background: #c84b34; }
.status-copy { min-width: 0; flex: 1; }.status-copy text { display: block; }.status-title { color: #9d3f2e; font-weight: 800; }
.status-actions { display: flex; gap: 12rpx; margin-top: 11rpx; }.status-actions button { min-height: 48px; margin: 0; padding: 0 18rpx; border-radius: 999rpx; font-size: 20rpx; }
.retry-action { background: #c94d36; color: #fff; }.edit-action { background: #fffaf4; color: #a74432; }
.card-fields { position: relative; margin: 0 16rpx; overflow: hidden; border: 1rpx solid #ded8cc; border-radius: 22rpx; background: #fffdf8; box-shadow: inset 0 1rpx 0 rgba(255,255,255,.9); }
.card-field { width: 100%; min-height: 104rpx; margin: 0; padding: 17rpx 16rpx 17rpx 14rpx; display: flex; align-items: stretch; gap: 12rpx; border-radius: 0; background: transparent; color: #233a32; text-align: left; }
.card-field::after { border: 0; }.card-field + .card-field { border-top: 1rpx solid #e7e1d6; }.card-field.missing { background: #fff3ef; }.card-field:active { background: #edf2ed; }
.field-rail { width: 38rpx; display: flex; flex: none; flex-direction: column; align-items: center; }
.field-index { min-height: 30rpx; display: flex; align-items: center; color: #b84a35; font-family: Georgia, serif; font-size: 17rpx; font-weight: 700; letter-spacing: .04em; }
.field-rail-line { width: 1rpx; min-height: 20rpx; margin-top: 7rpx; flex: 1; background: #d8c4ba; }
.card-field:last-child .field-rail-line { background: linear-gradient(180deg,#d8c4ba,rgba(216,196,186,0)); }
.field-content { min-width: 0; flex: 1; }.field-heading { justify-content: flex-start; flex-wrap: wrap; gap: 9rpx; }
.field-label { color: #1e3b30; font-size: 15px; font-weight: 800; }.field-status { padding: 3rpx 8rpx; border-radius: 999rpx; background: #f0eee8; color: #737d77; font-size: 10px; }.field-status.user { background: #e3eee7; color: #315b49; font-weight: 800; }
.field-edit-hint { min-width: 48px; min-height: 48px; display: flex; flex: none; align-items: center; justify-content: flex-end; color: #a74432; font-size: 12px; font-weight: 800; }
.field-value, .field-placeholder, .field-prompt { display: block; margin-top: 7rpx; overflow: visible; font-size: 15px; line-height: 1.58; white-space: pre-wrap; }
.field-value { color: #4b5c54; }.field-placeholder, .field-prompt { color: #8d6760; }
.card-note { display: block; margin: 14rpx 20rpx 0; padding: 14rpx 16rpx; border-left: 4rpx solid #7b9b89; border-radius: 0 14rpx 14rpx 0; background: #edf3ee; color: #4e6b5d; font-size: 13px; line-height: 1.55; }.card-note.warning { border-left-color: #c9523c; background: #faf0ec; color: #89584d; }
.card-actions { padding: 16rpx 20rpx 22rpx; }
.draft-actions { min-height: 48px; display: grid; grid-template-columns: 1fr 1rpx 1fr; align-items: center; overflow: hidden; border: 1rpx solid #cfd7d1; border-radius: 16rpx; background: rgba(238,242,235,.6); }
.quiet-card-action { min-height: 48px; margin: 0; padding: 0 12rpx; border-radius: 0; background: transparent; color: #315847; font-size: 14px; font-weight: 800; }
.quiet-card-action::after { border: 0; }
.draft-action-divider { width: 1rpx; height: 28rpx; background: #cfd7d1; }
.primary-card-action, .secondary-card-action, .success-action { min-height: 54px; margin: 0; border-radius: 999rpx; font-size: 14px; font-weight: 800; }
.primary-card-action { width: 100%; margin-top: 12rpx; background: #c84832; color: #fffaf3; box-shadow: 0 10rpx 24rpx rgba(190,68,46,.18); }
.card-actions > .primary-card-action:first-child { margin-top: 0; }
.primary-card-action[disabled] { background: #dddcd6; color: #868c87; box-shadow: none; }
.secondary-card-action { width: 100%; border: 0; background: transparent; color: #315847; text-decoration: underline; text-underline-offset: 5rpx; }
.secondary-card-action::after { border: 0; }
.card-actions > .secondary-card-action { margin-top: 12rpx; }
.action-privacy { display: block; margin-top: 13rpx; color: #7b8580; font-size: 18rpx; line-height: 1.5; text-align: center; }
.confirm-blocked { display: block; margin-top: 10rpx; color: #a43f2e; font-size: 18rpx; font-weight: 800; text-align: center; }
.shared-card { padding: 24rpx; border-color: #bcd0c2; background: linear-gradient(145deg,#edf4ee,#fffaf2); }.shared-card-heading { align-items: flex-start; }.shared-card .card-title { margin-top: 6rpx; font-size: 32rpx; }.shared-card-copy { display: block; margin-top: 15rpx; padding-top: 14rpx; border-top: 1rpx solid #cedbd1; color: #60746a; font-size: 20rpx; line-height: 1.55; }
.share-success { display: grid; grid-template-columns: 54rpx 1fr; gap: 14rpx; padding: 24rpx; border-radius: 28rpx; background: linear-gradient(145deg,#e3ece5,#f0f3eb); color: #52675d; font-size: 21rpx; line-height: 1.6; }
.success-mark { width: 52rpx; height: 52rpx; background: #3a8a55; font-size: 25rpx; }.success-copy { min-width: 0; }.success-copy text { display: block; }.success-title { color: #245840; font-size: 26rpx; font-weight: 800; }.success-action { grid-column: 1 / -1; width: 100%; margin-top: 8rpx; background: #cf4931; color: #fffaf3; }
.editor-layer { position: fixed; z-index: 90; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding-top: calc(24rpx + env(safe-area-inset-top)); box-sizing: border-box; }
.editor-backdrop { position: absolute; inset: 0; background: rgba(23,43,35,.58); backdrop-filter: blur(5rpx); animation: editor-fade-in .18s ease-out both; }
.editor-card { position: relative; z-index: 1; display: flex; flex-direction: column; width: 100%; max-width: 430px; max-height: min(92dvh, 1480rpx); overflow: hidden; border-radius: 34rpx 34rpx 0 0; background: #f8f3ea; box-shadow: 0 -24rpx 80rpx rgba(18,37,29,.3); animation: editor-card-in .22s cubic-bezier(.2,.8,.2,1) both; }
.editor-card-header { flex: none; align-items: flex-start; padding: 26rpx 24rpx 22rpx; border-bottom: 1rpx solid #ded7cb; background: rgba(255,253,248,.98); }
.editor-card-heading { min-width: 0; }.editor-kicker { display: block; color: #bd4933; font-size: 18rpx; font-weight: 800; letter-spacing: .1em; }.editor-title { display: block; margin-top: 7rpx; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 34rpx; font-weight: 700; line-height: 1.35; }.editor-description { display: block; margin-top: 7rpx; color: #6c7771; font-size: 19rpx; line-height: 1.55; }
.editor-close { width: 48px; min-width: 48px; height: 48px; min-height: 48px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #ebe6dd; color: #29483b; font-size: 28px; font-weight: 300; line-height: 1; }.editor-close::after { border: 0; }
.editor-card-body { min-height: 0; height: min(62dvh, 920rpx); flex: 1; background: #f8f3ea; }.editor-fields { padding: 0 24rpx 30rpx; }
.direct-field { display: block; padding: 22rpx 0; border-bottom: 1rpx solid #ddd6ca; }.direct-field-label { color: #315847; font-size: 20rpx; font-weight: 800; }.direct-field-label text:last-child { color: #868c87; font-weight: 500; }
.field-prompt { display: block; color: #7b8580; font-size: 18rpx; -webkit-line-clamp: initial; }
.field-input { box-sizing: border-box; width: 100%; min-height: 190rpx; margin-top: 12rpx; padding: 17rpx; border: 2rpx solid #cbc5ba; border-radius: 18rpx; background: #fffdf8; color: #233a32; font-size: 24rpx; line-height: 1.65; }.field-input:focus { border-color: #315847; }
.editor-card-footer { flex: none; padding: 16rpx 24rpx calc(18rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #d8d2c7; background: rgba(255,253,248,.98); box-shadow: 0 -12rpx 32rpx rgba(35,48,41,.06); }.editor-save-hint { display: block; margin-bottom: 12rpx; color: #6b7771; font-size: 18rpx; text-align: center; }.direct-editor-actions button { min-height: 52px; margin: 0; border-radius: 999rpx; font-size: 22rpx; font-weight: 800; }.collapse-edit { flex: 1; border: 2rpx solid #789286; background: transparent; color: #315847; }.save-edit { flex: 1.35; background: #cf4931; color: #fffaf3; }
.composer-dock { position: fixed; z-index: 15; bottom: 0; left: 50%; width: 100%; max-width: 430px; padding: 18rpx 26rpx calc(12rpx + env(safe-area-inset-bottom)); box-sizing: border-box; background: linear-gradient(180deg,rgba(243,239,230,0),#f3efe6 15%,#f3efe6); transform: translateX(-50%); }
.composer-tools { color: #7b8580; font-size: 18rpx; }.composer-tools button { min-height: 48px; margin: 0; padding: 0 6rpx; background: transparent; color: #a74432; font-size: 19rpx; line-height: 48px; }.composer-tools button::after { border: 0; }.composer-heading { margin: 2rpx 4rpx 9rpx; color: #858c87; font-size: 18rpx; }.composer-label { color: #315847; font-weight: 800; }
.composer { display: flex; align-items: flex-end; gap: 10rpx; padding: 9rpx 9rpx 9rpx 17rpx; border: 2rpx solid #cbc8bf; border-radius: 28rpx; background: #fffdf9; }.answer { box-sizing: border-box; flex: 1; width: auto; min-height: 48px; max-height: 190rpx; padding: 12rpx 3rpx 10rpx; background: transparent; color: #233a32; font-size: 24rpx; line-height: 1.6; }.send { width: 48px; min-width: 48px; height: 48px; min-height: 48px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #315847; color: #fffaf3; font-size: 28px; }.send[disabled] { background: #e2e2dc; color: #929893; }.composer-meta { margin: 8rpx 4rpx 0; color: #7b8580; font-size: 17rpx; }.clarification-tail { height: 2rpx; }
@keyframes typing-pulse { 0%,60%,100% { opacity: .28; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-4rpx); } }
@keyframes editor-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes editor-card-in { from { opacity: 0; transform: translateY(28rpx); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 360px) { .workspace-screen { padding-right: 20rpx; padding-left: 20rpx; }.card-heading { flex-direction: column; }.card-heading .state-pill { align-self: flex-start; }.composer-dock { padding-right: 20rpx; padding-left: 20rpx; } }
@media (prefers-reduced-motion: reduce) { .editor-backdrop, .editor-card, .typing text { animation: none; } }
</style>
