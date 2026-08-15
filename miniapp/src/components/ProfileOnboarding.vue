<template>
  <view
    v-if="open"
    ref="dialogRoot"
    class="profile-layer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="profile-title"
    tabindex="-1"
    @keydown="handleKeydown"
  >
    <view class="profile-backdrop" @tap="closeDraft" />
    <view class="profile-sheet" @tap.stop>
      <view class="sheet-head" :inert="confirmClear || undefined" :aria-hidden="confirmClear ? 'true' : undefined">
        <view ref="titleRef" class="heading" tabindex="-1">
          <text class="kicker">{{ profile.status === 'ACTIVE' ? '个人资料' : '开始之前' }}</text>
          <text id="profile-title" class="title">先告诉我怎么称呼你</text>
          <text class="description">称呼会在你加入沟通后展示，可以使用化名。偏好默认只属于你。</text>
        </view>
        <button class="close" role="button" tabindex="0" aria-label="关闭个人资料，不保存到账号" @tap="closeDraft" @keydown.enter.prevent="closeDraft" @keydown.space.prevent="closeDraft">×</button>
      </view>

      <view v-if="error" ref="errorRef" class="form-error" role="alert" tabindex="-1" :inert="confirmClear || undefined" :aria-hidden="confirmClear ? 'true' : undefined">{{ error }}</view>

      <view class="field-group" :inert="confirmClear || undefined" :aria-hidden="confirmClear ? 'true' : undefined">
        <label class="field-label" for="profile-name">称呼 <text>必填</text></label>
        <input
          id="profile-name"
          ref="nameRef"
          v-model="draft.displayName"
          class="text-input"
          :class="{ invalid: nameError }"
          maxlength="30"
          placeholder="例如：小雨"
          :aria-invalid="Boolean(nameError)"
          aria-describedby="profile-name-help"
          @blur="validateName"
        />
        <text id="profile-name-help" class="field-help" :class="{ 'error-copy': nameError }">
          {{ nameError || '1–30 个字符，不需要填写真实姓名。' }}
        </text>
      </view>

      <view class="field-group" :inert="confirmClear || undefined" :aria-hidden="confirmClear ? 'true' : undefined">
        <view class="field-heading"><text class="field-label">回答长度 <text>选填</text></text><text class="visibility">仅自己</text></view>
        <view class="choice-row" role="radiogroup" aria-label="回答长度">
          <button
            v-for="item in responseLengthOptions"
            :key="item.value"
            class="choice"
            :class="{ selected: draft.responseLength === item.value }"
            role="radio"
            tabindex="0"
            :aria-checked="draft.responseLength === item.value"
            @tap="draft.responseLength = draft.responseLength === item.value ? null : item.value"
            @keydown.enter.prevent="draft.responseLength = draft.responseLength === item.value ? null : item.value"
            @keydown.space.prevent="draft.responseLength = draft.responseLength === item.value ? null : item.value"
          >{{ item.label }}</button>
        </view>
        <label v-if="draft.responseLength" class="ai-switch">
          <switch :checked="draft.useResponseLengthAi" color="#315847" @change="draft.useResponseLengthAi = eventChecked($event)" />
          <view><text>供我的私人 AI 参考</text><text class="switch-help">用来调整回答的简洁程度</text></view>
        </label>
      </view>

      <view class="field-group" :inert="confirmClear || undefined" :aria-hidden="confirmClear ? 'true' : undefined">
        <view class="field-heading"><text class="field-label">常用语言 <text>选填</text></text><text class="visibility">仅自己</text></view>
        <view class="choice-row language-row" role="radiogroup" aria-label="常用语言">
          <button
            v-for="item in languageOptions"
            :key="item.value"
            class="choice"
            :class="{ selected: languagePreset === item.value }"
            role="radio"
            tabindex="0"
            :aria-checked="languagePreset === item.value"
            @tap="selectLanguage(item.value)"
            @keydown.enter.prevent="selectLanguage(item.value)"
            @keydown.space.prevent="selectLanguage(item.value)"
          >{{ item.label }}</button>
        </view>
        <input
          v-if="languagePreset === 'OTHER'"
          v-model="customLanguage"
          class="text-input compact"
          maxlength="30"
          aria-label="其他常用语言"
          placeholder="填写常用语言"
        />
        <label v-if="draft.language" class="ai-switch">
          <switch :checked="draft.useLanguageAi" color="#315847" @change="draft.useLanguageAi = eventChecked($event)" />
          <view><text>供我的私人 AI 参考</text><text class="switch-help">用来选择更自然的表达语言</text></view>
        </label>
      </view>

      <view class="privacy-preview" :inert="confirmClear || undefined" :aria-hidden="confirmClear ? 'true' : undefined">
        <view><text class="preview-mark shared">对方</text><text>只会看到你保存的称呼</text></view>
        <view><text class="preview-mark private">私</text><text>回答偏好和语言只属于你</text></view>
        <button class="privacy-link" role="button" tabindex="0" :aria-expanded="showPrivacy" @tap="showPrivacy = !showPrivacy" @keydown.enter.prevent="showPrivacy = !showPrivacy" @keydown.space.prevent="showPrivacy = !showPrivacy">查看 AI 与资料隐私说明</button>
        <text v-if="showPrivacy" class="privacy-detail">启用的偏好会发送到 Cloudflare Workers AI。模型内容不会进入 Cloudflare 持久存储，也不会未经同意用于训练或改进服务；说开保存的偏好可随时清空。</text>
      </view>

      <view v-if="confirmClear" ref="confirmClearRef" class="clear-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description">
        <text id="clear-title" class="clear-title">清空这些偏好？</text>
        <text id="clear-description">回答长度、常用语言和对应 AI 开关会永久清除。称呼、房间和历史对话不受影响。</text>
        <view class="clear-actions">
          <button ref="keepPreferencesButton" role="button" :tabindex="busy ? -1 : 0" :disabled="busy" @tap="confirmClear = false" @keydown.enter.prevent="!busy && (confirmClear = false)" @keydown.space.prevent="!busy && (confirmClear = false)">继续保留</button>
          <button class="danger" role="button" :tabindex="busy ? -1 : 0" :disabled="busy" @tap="$emit('clear')" @keydown.enter.prevent="!busy && $emit('clear')" @keydown.space.prevent="!busy && $emit('clear')">清空这些偏好</button>
        </view>
      </view>

      <view class="sheet-actions" :inert="confirmClear || undefined" :aria-hidden="confirmClear ? 'true' : undefined">
        <button class="primary" role="button" :tabindex="busy || !canSave ? -1 : 0" :loading="busy" :disabled="busy || !canSave" @tap="save(false)" @keydown.enter.prevent="!busy && canSave && save(false)" @keydown.space.prevent="!busy && canSave && save(false)">
          {{ profile.status === 'ACTIVE' ? '保存个人资料' : '保存并进入说开' }}
        </button>
        <button v-if="shouldOfferNameOnlySave(profile.status)" class="secondary" role="button" :tabindex="busy || !canSave ? -1 : 0" :disabled="busy || !canSave" @tap="save(true)" @keydown.enter.prevent="!busy && canSave && save(true)" @keydown.space.prevent="!busy && canSave && save(true)">只保存称呼</button>
        <button v-if="profile.status === 'ACTIVE' && (profile.responseLength || profile.language)" ref="clearPreferencesTrigger" class="clear-link" role="button" :tabindex="busy ? -1 : 0" :disabled="busy" @tap="confirmClear = true" @keydown.enter.prevent="!busy && (confirmClear = true)" @keydown.space.prevent="!busy && (confirmClear = true)">清空可选资料</button>
        <button class="draft-link" role="button" :tabindex="busy ? -1 : 0" :disabled="busy" @tap="closeDraft" @keydown.enter.prevent="!busy && closeDraft()" @keydown.space.prevent="!busy && closeDraft()">关闭并保留草稿</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import {
  emptyProfileDraft,
  normalizeDisplayName,
  responseLengthOptions,
  shouldOfferNameOnlySave,
  type ProfileDraft,
  type UserProfile,
} from "../domain/profile-context";

const props = defineProps<{
  open: boolean;
  profile: UserProfile;
  savedDraft: ProfileDraft | null;
  busy: boolean;
  error: string;
}>();

const emit = defineEmits<{
  close: [draft: ProfileDraft];
  save: [draft: ProfileDraft];
  clear: [];
  "draft-change": [draft: ProfileDraft];
}>();

const languageOptions = [
  { value: "简体中文", label: "简体中文" },
  { value: "繁體中文", label: "繁體中文" },
  { value: "English", label: "English" },
  { value: "OTHER", label: "其他" },
] as const;
const draft = reactive<ProfileDraft>(emptyProfileDraft());
const languagePreset = ref<string | null>(null);
const customLanguage = ref("");
const nameError = ref("");
const showPrivacy = ref(false);
const confirmClear = ref(false);
const dialogRoot = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
const titleRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
const nameRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
const errorRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
const confirmClearRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
const keepPreferencesButton = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
const clearPreferencesTrigger = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
let previousFocus: HTMLElement | null = null;

const canSave = computed(() => {
  const name = normalizeDisplayName(draft.displayName);
  return name.length >= 1 && name.length <= 30 && (languagePreset.value !== "OTHER" || Boolean(customLanguage.value.trim()));
});

function dom(value: HTMLElement | { $el?: HTMLElement } | null): HTMLElement | null {
  if (!value) return null;
  if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) return value;
  return "$el" in value ? value.$el ?? null : null;
}

function loadDraft() {
  const source = props.savedDraft ?? (props.profile.status === "ACTIVE" ? {
    displayName: props.profile.displayName,
    responseLength: props.profile.responseLength,
    language: props.profile.language,
    useResponseLengthAi: props.profile.useResponseLengthAi,
    useLanguageAi: props.profile.useLanguageAi,
  } : emptyProfileDraft());
  Object.assign(draft, source);
  const known = languageOptions.slice(0, 3).some((item) => item.value === source.language);
  languagePreset.value = source.language ? known ? source.language : "OTHER" : null;
  customLanguage.value = known ? "" : source.language ?? "";
}

watch(() => props.open, async (open) => {
  if (!open) return;
  loadDraft();
  confirmClear.value = false;
  if (typeof document !== "undefined") {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    dom(titleRef.value)?.focus();
  }
});

watch(() => props.error, async (error) => {
  if (!error || typeof document === "undefined") return;
  confirmClear.value = false;
  await nextTick();
  dom(errorRef.value)?.focus();
});

watch(() => props.profile.revision, () => {
  if (!props.open) return;
  loadDraft();
  confirmClear.value = false;
});

watch(confirmClear, async (open) => {
  if (typeof document === "undefined") return;
  await nextTick();
  if (open) dom(keepPreferencesButton.value)?.focus();
  else (dom(clearPreferencesTrigger.value) ?? dom(titleRef.value))?.focus();
});

watch([draft, customLanguage, languagePreset], () => {
  if (languagePreset.value === "OTHER") draft.language = customLanguage.value;
  emit("draft-change", { ...draft });
}, { deep: true, flush: "sync" });

function validateName() {
  const name = normalizeDisplayName(draft.displayName);
  nameError.value = !name ? "请填写一个希望别人怎样称呼你的名字，也可以使用化名。"
    : name.length > 30 ? "称呼最多 30 个字符，请缩短后再保存。" : "";
  return !nameError.value;
}

function selectLanguage(value: string) {
  if (languagePreset.value === value) {
    languagePreset.value = null;
    draft.language = null;
    customLanguage.value = "";
    return;
  }
  languagePreset.value = value;
  if (value !== "OTHER") draft.language = value;
  else draft.language = customLanguage.value;
}

function eventChecked(event: Event) {
  return Boolean((event as unknown as { detail?: { value?: boolean } }).detail?.value);
}

function save(nameOnly: boolean) {
  if (!validateName()) {
    nextTick(() => dom(nameRef.value)?.focus());
    return;
  }
  const value = {
    ...draft,
    displayName: normalizeDisplayName(draft.displayName),
    ...(nameOnly ? {
      responseLength: null,
      language: null,
      useResponseLengthAi: false,
      useLanguageAi: false,
    } : {}),
  };
  emit("save", value);
}

function closeDraft() {
  emit("close", { ...draft });
  nextTick(() => previousFocus?.focus());
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    if (confirmClear.value) confirmClear.value = false;
    else closeDraft();
    return;
  }
  if (event.key !== "Tab") return;
  const root = dom(confirmClear.value ? confirmClearRef.value : dialogRoot.value);
  if (!root) return;
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((item) => item.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}
</script>

<style scoped lang="scss">
.profile-layer { position: fixed; z-index: 90; inset: 0; display: flex; align-items: flex-end; justify-content: center; }
.profile-backdrop { position: absolute; inset: 0; background: rgba(20, 31, 26, .56); backdrop-filter: blur(5px); }
.profile-sheet { position: relative; width: min(100%, 720px); max-height: 92vh; overflow-y: auto; padding: 34rpx 34rpx calc(34rpx + env(safe-area-inset-bottom)); border-radius: 36rpx 36rpx 0 0; background: #fffdf8; color: #1c2923; box-shadow: 0 -20rpx 70rpx rgba(20, 31, 26, .18); }
.sheet-head { display: flex; align-items: flex-start; gap: 20rpx; }
.heading { flex: 1; outline: none; }
.kicker, .title, .description, .field-label, .field-help, .switch-help, .privacy-detail, .clear-title, .clear-dialog text { display: block; }
.kicker { color: #be442e; font-size: 22rpx; font-weight: 800; letter-spacing: .14em; }
.title { margin-top: 10rpx; font-family: serif; font-size: 46rpx; font-weight: 800; line-height: 1.18; }
.description { margin-top: 12rpx; color: #68726c; font-size: 25rpx; line-height: 1.65; }
.close { flex: none; width: 48px; height: 48px; padding: 0; border: 1px solid #dedbd3; border-radius: 50%; background: #fffdf8; color: #1c2923; font-size: 25px; line-height: 46px; }
.form-error { margin-top: 24rpx; padding: 20rpx; border-left: 6rpx solid #be442e; background: #fff0ec; color: #8e2d1c; outline: none; font-size: 24rpx; line-height: 1.6; }
.field-group { margin-top: 32rpx; padding-top: 28rpx; border-top: 1px solid #e7e2d9; }
.field-heading { display: flex; justify-content: space-between; gap: 20rpx; }
.field-label { margin-bottom: 13rpx; font-size: 26rpx; font-weight: 800; }
.field-label text, .visibility { color: #68726c; font-size: 20rpx; font-weight: 600; }
.text-input { box-sizing: border-box; width: 100%; min-height: 50px; padding: 0 20rpx; border: 2rpx solid #c9c9c1; border-radius: 16rpx; background: #fff; color: #1c2923; font-size: 28rpx; }
.text-input:focus { border-color: #315847; outline: 3px solid rgba(49, 88, 71, .16); }
.text-input.invalid { border-color: #be442e; }
.text-input.compact { margin-top: 14rpx; }
.field-help { margin-top: 9rpx; color: #68726c; font-size: 21rpx; line-height: 1.5; }
.error-copy { color: #9b321f; }
.choice-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12rpx; }
.language-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.choice { min-height: 48px; padding: 14rpx 12rpx; border: 2rpx solid #d2d0c8; border-radius: 14rpx; background: #fff; color: #34433c; font-size: 23rpx; line-height: 1.35; }
.choice.selected { border-color: #315847; background: #e8f0ea; color: #1f4938; font-weight: 800; }
.ai-switch { display: flex; align-items: center; gap: 16rpx; min-height: 48px; margin-top: 18rpx; color: #2d4338; font-size: 23rpx; }
.switch-help { margin-top: 3rpx; color: #68726c; font-size: 20rpx; }
.privacy-preview { display: grid; gap: 13rpx; margin-top: 30rpx; padding: 24rpx; border-radius: 18rpx; background: #f1eee6; color: #4d5b54; font-size: 22rpx; line-height: 1.55; }
.privacy-preview > view { display: flex; align-items: center; gap: 14rpx; }
.preview-mark { flex: none; min-width: 52rpx; padding: 4rpx 8rpx; border-radius: 999rpx; text-align: center; font-size: 18rpx; font-weight: 800; }
.preview-mark.shared { background: #f6ddd7; color: #8d2f1f; }
.preview-mark.private { background: #dce9df; color: #24513d; }
.privacy-link, .clear-link, .draft-link { min-height: 44px; padding: 10rpx 0; border: 0; background: transparent; color: #315847; font-size: 22rpx; text-align: left; text-decoration: underline; }
.privacy-detail { color: #58665f; }
.clear-dialog { margin-top: 24rpx; padding: 24rpx; border: 2rpx solid #be442e; border-radius: 18rpx; background: #fff4f1; color: #633226; font-size: 22rpx; line-height: 1.6; }
.clear-title { margin-bottom: 8rpx; color: #7d291a; font-weight: 800; }
.clear-actions { display: flex; gap: 12rpx; margin-top: 16rpx; }
.clear-actions button { min-height: 44px; flex: 1; border: 1px solid #b9b4aa; border-radius: 12rpx; background: #fff; color: #1c2923; font-size: 21rpx; }
.clear-actions .danger { border-color: #be442e; background: #be442e; color: #fff; }
.sheet-actions { display: grid; gap: 12rpx; margin-top: 28rpx; }
.sheet-actions button { min-height: 48px; border-radius: 16rpx; font-size: 25rpx; font-weight: 800; }
.primary { border: 0; background: #be442e; color: #fff; }
.primary[disabled] { opacity: .52; }
.secondary { border: 2rpx solid #315847; background: #fffdf8; color: #315847; }
.sheet-actions .clear-link, .sheet-actions .draft-link { font-size: 22rpx; font-weight: 600; text-align: center; }
@media (min-width: 760px) { .profile-layer { align-items: center; padding: 32px; } .profile-sheet { max-height: calc(100vh - 64px); border-radius: 28px; } }
@media (prefers-reduced-motion: reduce) { .profile-backdrop { backdrop-filter: none; } }
</style>
