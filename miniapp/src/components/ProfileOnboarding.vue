<template>
  <view
    v-if="open"
    ref="dialogRoot"
    class="profile-layer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="profile-title"
    aria-describedby="profile-description"
    tabindex="-1"
    @keydown="handleKeydown"
  >
    <view class="profile-backdrop" @tap="closeDraft" />
    <view class="profile-sheet" @tap.stop>
      <view class="sheet-scroll" :inert="confirmClear || undefined" :aria-hidden="confirmClear ? 'true' : undefined">
        <view class="sheet-head">
          <view ref="titleRef" class="heading" tabindex="-1">
            <text class="kicker">{{ profile.status === 'ACTIVE' ? '个人资料' : '开始之前' }}</text>
            <text id="profile-title" class="title">别人怎么称呼你？</text>
            <text id="profile-description" class="description">称呼会在加入沟通后显示，可以使用化名。回答偏好和常用语言只对你可见。</text>
          </view>
          <button class="close" role="button" tabindex="0" aria-label="关闭个人资料并保留草稿" @tap="closeDraft" @keydown.enter.prevent="closeDraft" @keydown.space.prevent="closeDraft"><text aria-hidden="true">×</text></button>
        </view>

        <view class="sheet-body">
          <view v-if="error" ref="errorRef" class="form-error" role="alert" tabindex="-1">
            <text class="error-mark" aria-hidden="true">!</text>
            <text>{{ error }}</text>
          </view>

        <view class="field-group name-field">
          <label class="field-label" for="profile-name">称呼 <text>※必填</text></label>
          <input
            id="profile-name"
            ref="nameRef"
            v-model="draft.displayName"
            class="text-input"
            :class="{ invalid: nameError }"
            maxlength="30"
            placeholder="例如：小雨"
            :aria-invalid="Boolean(nameError)"
            aria-required="true"
            aria-describedby="profile-name-help"
            confirm-type="done"
            @blur="validateName"
          />
          <text id="profile-name-help" class="field-help" :class="{ 'error-copy': nameError }">
            {{ nameError ? `＊${nameError}` : '1–30 个字符，不需要填写真实姓名。' }}
          </text>
        </view>

        <view class="field-group">
          <view class="field-heading">
            <view>
              <text class="field-label">回答长度 <text>※任意</text></text>
              <text id="response-length-help" class="section-help">选一个偏好；再次点按可取消。</text>
            </view>
            <text class="visibility">仅自己</text>
          </view>
          <view class="choice-row" role="group" aria-label="回答长度，可选" aria-describedby="response-length-help">
            <button
              v-for="item in responseLengthOptions"
              :key="item.value"
              class="choice"
              :class="{ selected: draft.responseLength === item.value }"
              tabindex="0"
              :aria-pressed="draft.responseLength === item.value"
              @tap="draft.responseLength = draft.responseLength === item.value ? null : item.value"
              @keydown.enter.prevent="draft.responseLength = draft.responseLength === item.value ? null : item.value"
              @keydown.space.prevent="draft.responseLength = draft.responseLength === item.value ? null : item.value"
            ><text>{{ item.label }}</text><text v-if="draft.responseLength === item.value" class="choice-state">已选</text></button>
          </view>
          <label v-if="draft.responseLength" class="ai-switch">
            <view class="switch-copy">
              <text class="switch-title">让私人 AI 参考</text>
              <text id="response-ai-help" class="switch-help">开启后，用这项偏好调整回答的简洁程度。</text>
            </view>
            <switch class="preference-switch" :checked="draft.useResponseLengthAi" color="#315847" aria-label="让私人 AI 参考回答长度偏好" aria-describedby="response-ai-help" @change="draft.useResponseLengthAi = eventChecked($event)" />
          </label>
        </view>

        <view class="field-group">
          <view class="field-heading">
            <view>
              <text class="field-label">常用语言 <text>※任意</text></text>
              <text id="language-help" class="section-help">选一个偏好；再次点按可取消。</text>
            </view>
            <text class="visibility">仅自己</text>
          </view>
          <view class="choice-row language-row" role="group" aria-label="常用语言，可选" aria-describedby="language-help">
            <button
              v-for="item in languageOptions"
              :key="item.value"
              class="choice"
              :class="{ selected: languagePreset === item.value }"
              tabindex="0"
              :aria-pressed="languagePreset === item.value"
              @tap="selectLanguage(item.value)"
              @keydown.enter.prevent="selectLanguage(item.value)"
              @keydown.space.prevent="selectLanguage(item.value)"
            ><text>{{ item.label }}</text><text v-if="languagePreset === item.value" class="choice-state">已选</text></button>
          </view>
          <view v-if="languagePreset === 'OTHER'" class="custom-language">
            <label class="field-label compact-label" for="custom-language">常用语言名称 <text>※必填</text></label>
            <input
              id="custom-language"
              v-model="customLanguage"
              class="text-input"
              maxlength="30"
              aria-required="true"
              aria-describedby="custom-language-help"
              placeholder="例如：粤语"
              confirm-type="done"
            />
            <text id="custom-language-help" class="field-help">最多 30 个字符。</text>
          </view>
          <label v-if="draft.language" class="ai-switch">
            <view class="switch-copy">
              <text class="switch-title">让私人 AI 参考</text>
              <text id="language-ai-help" class="switch-help">开启后，用这项偏好选择更自然的表达语言。</text>
            </view>
            <switch class="preference-switch" :checked="draft.useLanguageAi" color="#315847" aria-label="让私人 AI 参考常用语言偏好" aria-describedby="language-ai-help" @change="draft.useLanguageAi = eventChecked($event)" />
          </label>
        </view>

        <view class="privacy-preview" aria-labelledby="privacy-title">
          <text id="privacy-title" class="privacy-title">资料怎样使用</text>
          <view class="privacy-row"><text class="preview-mark shared">对方可见</text><text>只会看到你保存的称呼</text></view>
          <view class="privacy-row"><text class="preview-mark private">仅自己</text><text>回答偏好和常用语言只属于你</text></view>
          <button class="privacy-link" role="button" tabindex="0" :aria-expanded="showPrivacy" aria-controls="privacy-detail" @tap="showPrivacy = !showPrivacy" @keydown.enter.prevent="showPrivacy = !showPrivacy" @keydown.space.prevent="showPrivacy = !showPrivacy">{{ showPrivacy ? '收起 AI 与资料隐私说明' : '查看 AI 与资料隐私说明' }}</button>
          <text v-if="showPrivacy" id="privacy-detail" class="privacy-detail">启用的偏好会发送到 Cloudflare Workers AI。模型内容不会进入 Cloudflare 持久存储，也不会未经同意用于训练或改进服务；说开保存的偏好可随时清空。</text>
        </view>

          <button v-if="shouldOfferNameOnlySave(profile.status)" class="name-only-link" role="button" :tabindex="busy || !canSave ? -1 : 0" :disabled="busy || !canSave" @tap="save(true)" @keydown.enter.prevent="!busy && canSave && save(true)" @keydown.space.prevent="!busy && canSave && save(true)">只保存称呼</button>
          <button v-if="profile.status === 'ACTIVE' && (profile.responseLength || profile.language)" ref="clearPreferencesTrigger" class="clear-link" role="button" :tabindex="busy ? -1 : 0" :disabled="busy" @tap="confirmClear = true" @keydown.enter.prevent="!busy && (confirmClear = true)" @keydown.space.prevent="!busy && (confirmClear = true)">清空可选资料</button>
        </view>
      </view>

      <view v-if="confirmClear" ref="confirmClearRef" class="clear-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description">
        <view class="clear-card">
          <text id="clear-title" class="clear-title">清空这些偏好？</text>
          <text id="clear-description">回答长度、常用语言和对应 AI 开关会永久清除。称呼、房间和历史对话不受影响。</text>
          <view class="clear-actions">
            <button ref="keepPreferencesButton" role="button" :tabindex="busy ? -1 : 0" :disabled="busy" @tap="confirmClear = false" @keydown.enter.prevent="!busy && (confirmClear = false)" @keydown.space.prevent="!busy && (confirmClear = false)">继续保留</button>
            <button class="danger" role="button" :tabindex="busy ? -1 : 0" :disabled="busy" @tap="$emit('clear')" @keydown.enter.prevent="!busy && $emit('clear')" @keydown.space.prevent="!busy && $emit('clear')">清空这些偏好</button>
          </view>
        </view>
      </view>

      <view class="sheet-actions" :inert="confirmClear || undefined" :aria-hidden="confirmClear ? 'true' : undefined">
        <button class="primary" role="button" :tabindex="busy || !canSave ? -1 : 0" :loading="busy" :disabled="busy || !canSave" :aria-busy="busy" @tap="save(false)" @keydown.enter.prevent="!busy && canSave && save(false)" @keydown.space.prevent="!busy && canSave && save(false)">
          {{ busy ? '正在保存…' : profile.status === 'ACTIVE' ? '保存个人资料' : '保存并进入说开' }}
        </button>
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
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}
</script>

<style scoped lang="scss">
.profile-layer { position: fixed; z-index: 90; inset: 0; display: flex; align-items: stretch; justify-content: center; }
.profile-backdrop { position: absolute; inset: 0; background: rgba(18, 28, 23, .62); backdrop-filter: blur(6px); animation: backdrop-in .18s ease-out; }
.profile-sheet {
  --profile-surface: #fffaf2;
  --profile-raised: #fffefa;
  --profile-ink: #202923;
  --profile-muted: #59665f;
  --profile-line: #7c847e;
  --profile-soft-line: #d9d4ca;
  --profile-accent: #9b3828;
  --profile-green: #285440;
  --profile-green-soft: #e2eee7;
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  max-height: 100vh;
  max-height: 100dvh;
  overflow: hidden;
  background: var(--profile-surface);
  color: var(--profile-ink);
  box-shadow: 0 -20px 70px rgba(20, 31, 26, .2);
  animation: sheet-in .2s ease-out;
}
.profile-sheet button::after { border: 0; }
.sheet-scroll { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scroll-padding: 24px 0 112px; -webkit-overflow-scrolling: touch; }
.sheet-head { display: flex; align-items: flex-start; gap: 16px; padding: calc(20px + env(safe-area-inset-top)) 20px 18px; border-bottom: 1px solid var(--profile-soft-line); }
.heading { flex: 1; min-width: 0; outline: none; }
.kicker, .title, .description, .field-label, .field-help, .section-help, .switch-title, .switch-help, .privacy-title, .privacy-detail, .clear-title, .clear-card text { display: block; }
.kicker { color: var(--profile-accent); font-size: 14px; font-weight: 800; letter-spacing: .14em; }
.title { margin-top: 8px; font-family: "Songti SC", "STSong", "Noto Serif CJK SC", serif; font-size: 34px; font-weight: 800; line-height: 1.18; letter-spacing: -.02em; }
.description { max-width: 34em; margin-top: 10px; color: var(--profile-muted); font-size: 16px; line-height: 1.6; }
.close { flex: none; width: 48px; height: 48px; margin: -4px -4px 0 0; padding: 0; border: 1px solid var(--profile-line); border-radius: 50%; background: var(--profile-raised); color: var(--profile-ink); font-size: 28px; line-height: 44px; }
.sheet-body { padding: 0 20px 28px; }
.form-error { display: flex; align-items: flex-start; gap: 12px; margin-top: 20px; padding: 14px 16px; border-left: 4px solid var(--profile-accent); border-radius: 0 12px 12px 0; background: #fbe9e3; color: #7d291c; outline: none; font-size: 16px; line-height: 1.55; }
.error-mark { display: grid; flex: none; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--profile-accent); color: #fff; font-weight: 800; }
.field-group { margin-top: 28px; padding-top: 28px; border-top: 1px solid var(--profile-soft-line); }
.field-group.name-field { margin-top: 24px; padding-top: 0; border-top: 0; }
.field-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.field-label { margin-bottom: 10px; font-size: 18px; font-weight: 800; line-height: 1.4; }
.field-label text { color: var(--profile-muted); font-size: 14px; font-weight: 700; }
.section-help { margin-top: -4px; color: var(--profile-muted); font-size: 14px; line-height: 1.5; }
.visibility { flex: none; margin-top: 1px; padding: 4px 8px; border: 1px solid var(--profile-green); border-radius: 999px; color: var(--profile-green); font-size: 13px; font-weight: 700; line-height: 1.35; }
.text-input { box-sizing: border-box; width: 100%; min-height: 52px; padding: 10px 14px; border: 1px solid var(--profile-line); border-radius: 12px; background: var(--profile-raised); color: var(--profile-ink); font-size: 18px; line-height: 1.45; }
.text-input:focus { border-color: var(--profile-green); outline: 3px solid #1e6547; outline-offset: 2px; }
.text-input.invalid { border-width: 2px; border-color: var(--profile-accent); }
.custom-language { margin-top: 18px; }
.compact-label { font-size: 16px; }
.field-help { margin-top: 8px; color: var(--profile-muted); font-size: 14px; line-height: 1.55; }
.error-copy { color: #842b1d; font-weight: 700; }
.choice-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.language-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.choice { display: flex; align-items: center; justify-content: center; gap: 7px; box-sizing: border-box; width: 100%; min-width: 0; min-height: 52px; padding: 10px 12px; border: 1px solid var(--profile-line); border-radius: 12px; background: var(--profile-raised); color: #34433c; font-size: 16px; line-height: 1.35; }
.choice.selected { border: 2px solid var(--profile-green); background: var(--profile-green-soft); color: #193f2f; font-weight: 800; }
.choice-state { flex: none; padding: 2px 5px; border-radius: 999px; background: var(--profile-green); color: #fff; font-size: 11px; font-weight: 800; line-height: 1.35; }
.ai-switch { display: flex; align-items: center; justify-content: space-between; gap: 16px; box-sizing: border-box; min-height: 64px; margin-top: 16px; padding: 12px 14px; border: 1px solid var(--profile-soft-line); border-radius: 12px; background: rgba(226, 238, 231, .42); color: #263c32; }
.switch-copy { flex: 1; min-width: 0; }
.switch-title { font-size: 16px; font-weight: 800; line-height: 1.4; }
.switch-help { margin-top: 3px; color: var(--profile-muted); font-size: 14px; line-height: 1.5; }
.preference-switch { flex: none; min-width: 48px; min-height: 48px; }
.privacy-preview { display: grid; gap: 12px; margin-top: 28px; padding: 18px; border-left: 3px solid var(--profile-green); background: #f0eee7; color: #48564f; font-size: 15px; line-height: 1.55; }
.privacy-title { color: var(--profile-ink); font-family: "Songti SC", "STSong", "Noto Serif CJK SC", serif; font-size: 19px; font-weight: 800; }
.privacy-row { display: flex; align-items: flex-start; gap: 10px; }
.preview-mark { flex: none; min-width: 62px; padding: 3px 7px; border-radius: 999px; text-align: center; font-size: 12px; font-weight: 800; line-height: 1.45; }
.preview-mark.shared { background: #f4d9d0; color: #79291d; }
.preview-mark.private { background: #d7e8de; color: #1d4936; }
.privacy-link, .name-only-link, .clear-link { min-height: 48px; padding: 10px 0; border: 0; background: transparent; color: var(--profile-green); font-size: 15px; line-height: 1.45; text-align: left; text-decoration: underline; text-underline-offset: 3px; }
.privacy-detail { color: #4f5e56; font-size: 14px; line-height: 1.65; }
.name-only-link, .clear-link { display: block; margin-top: 12px; }
.clear-link { color: #842b1d; }
.clear-dialog { position: absolute; z-index: 2; inset: 0; display: flex; box-sizing: border-box; overflow-y: auto; padding: calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom)); background: rgba(25, 29, 26, .68); }
.clear-card { box-sizing: border-box; width: 100%; max-width: 430px; margin: auto; padding: 24px; border: 2px solid var(--profile-accent); border-radius: 18px; background: var(--profile-raised); color: #633226; font-size: 16px; line-height: 1.6; box-shadow: 0 18px 60px rgba(20, 31, 26, .24); }
.clear-title { margin-bottom: 8px; color: #762719; font-family: "Songti SC", "STSong", "Noto Serif CJK SC", serif; font-size: 24px; font-weight: 800; }
.clear-actions { display: flex; gap: 12px; margin-top: 20px; }
.clear-actions button { flex: 1; min-height: 48px; padding: 10px 12px; border: 1px solid var(--profile-line); border-radius: 12px; background: var(--profile-raised); color: var(--profile-ink); font-size: 15px; font-weight: 800; line-height: 1.35; }
.clear-actions .danger { border-color: var(--profile-accent); background: var(--profile-accent); color: #fff; }
.sheet-actions { display: grid; flex: none; gap: 10px; padding: 14px 20px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid var(--profile-soft-line); background: rgba(255, 250, 242, .97); box-shadow: 0 -10px 30px rgba(32, 41, 35, .08); }
.sheet-actions button { width: 100%; min-height: 52px; padding: 11px 16px; border-radius: 12px; font-size: 17px; font-weight: 800; line-height: 1.35; }
.primary { border: 2px solid var(--profile-accent); background: var(--profile-accent); color: #fff; }
.primary[disabled] { opacity: .52; }
.profile-sheet button:focus-visible, .profile-sheet switch:focus-visible { outline: 3px solid #1e6547; outline-offset: 3px; }

@media (max-width: 359px) {
  .choice-row, .language-row { grid-template-columns: 1fr; }
  .field-heading { display: block; }
  .visibility { display: inline-block; margin-top: 8px; }
  .ai-switch { align-items: flex-start; }
  .clear-actions { flex-direction: column; }
}

@media (min-width: 760px) and (min-height: 560px) {
  .profile-layer { align-items: center; padding: 32px; }
  .profile-sheet { width: min(560px, calc(100vw - 64px)); height: auto; max-height: calc(100vh - 64px); max-height: calc(100dvh - 64px); border-radius: 26px; box-shadow: 0 28px 90px rgba(20, 31, 26, .26); }
  .sheet-head { padding: 24px 28px 20px; }
  .sheet-body { padding-right: 28px; padding-left: 28px; }
  .sheet-actions { padding: 16px 28px 20px; }
}

@media (prefers-reduced-motion: reduce) {
  .profile-backdrop { backdrop-filter: none; animation: none; }
  .profile-sheet { animation: none; }
}

@keyframes backdrop-in { from { opacity: 0; } }
@keyframes sheet-in { from { opacity: 0; transform: translateY(16px); } }
</style>
