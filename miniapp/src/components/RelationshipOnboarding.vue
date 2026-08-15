<template>
  <view class="relationship-flow">
    <view ref="headingRef" class="flow-heading" tabindex="-1">
      <text class="eyebrow">{{ role === 'A' ? '发起沟通前' : '接受邀请前' }}</text>
      <text class="progress" role="status">第 {{ step }} 步，共 4 步</text>
      <text class="title">{{ heading.title }}</text>
      <text class="description">{{ heading.description }}</text>
    </view>

    <view v-if="error" class="flow-error" role="alert">{{ error }}</view>

    <template v-if="role === 'B' && step === 1">
      <view class="inviter-version">
        <text class="version-label">邀请方版本 · 尚未由你确认</text>
        <view v-if="shared.status === 'SKIPPED' || shared.status === 'MISSING'" class="empty-copy">对方没有补充关系背景。你仍然可以正常继续。</view>
        <view v-else class="summary-list">
          <view><text>关系</text><text>{{ relationshipLabel(shared) }}</text></view>
          <view><text>相处时间</text><text>{{ optionLabel(durationOptions, shared.durationRange) }}</text></view>
          <view><text>相处方式</text><text>{{ optionLabel(interactionOptions, shared.interactionMode) }}</text></view>
        </view>
      </view>
      <view class="decision-list" role="radiogroup" aria-label="邀请背景是否符合我的理解">
        <button v-for="item in decisions" :key="item.value" class="decision" :class="{ selected: decision === item.value }" role="radio" tabindex="0" :aria-checked="decision === item.value" @tap="decision = item.value" @keydown.enter.prevent="decision = item.value" @keydown.space.prevent="decision = item.value">
          <text class="decision-title">{{ item.label }}</text><text class="decision-copy">{{ item.description }}</text>
        </button>
      </view>
    </template>

    <template v-else-if="isSharedStep">
      <button v-if="role === 'A'" class="skip-top" role="button" tabindex="0" @tap="saveSkipped" @keydown.enter.prevent="saveSkipped" @keydown.space.prevent="saveSkipped">暂不补充关系背景</button>
      <ChoiceGroup label="你们是什么关系？" :items="relationshipTypeOptions" :model-value="mineShared.relationshipType" @update:model-value="mineShared.relationshipType = $event" />
      <view v-if="mineShared.relationshipType === 'OTHER'" class="custom-field">
        <label for="relationship-other">其他关系类型</label>
        <input id="relationship-other" v-model="relationshipOther" maxlength="30" placeholder="例如：室友" />
        <text>{{ relationshipOther.length }} / 30</text>
      </view>
      <ChoiceGroup label="大约相处多久了？" :items="durationOptions" :model-value="mineShared.durationRange" @update:model-value="mineShared.durationRange = $event" />
      <ChoiceGroup label="现在通常怎样相处？" :items="interactionOptions" :model-value="mineShared.interactionMode" @update:model-value="mineShared.interactionMode = $event" />
      <text class="optional-note">以上都可以暂不选择。受邀者可以确认，也可以保留自己的版本。</text>
    </template>

    <template v-else-if="step === 2 && role === 'A' || step === 3 && role === 'B'">
      <ChoiceGroup label="发生分歧时，你通常会？" :items="communicationPaceOptions" :model-value="mine.communicationPace" @update:model-value="mine.communicationPace = $event" />
      <ChoiceGroup label="你更希望先得到什么？" :items="responsePreferenceOptions" :model-value="mine.responsePreference" @update:model-value="mine.responsePreference = $event" />
      <ChoiceGroup label="一起行动时，你通常偏向？" :items="planningStyleOptions" :model-value="mine.planningStyle" @update:model-value="mine.planningStyle = $event" />
      <ChoiceGroup v-if="role === 'B'" label="你眼中的关系现在怎样？" :items="relationshipStateOptions" :model-value="mine.relationshipState" @update:model-value="mine.relationshipState = $event" />
      <label v-if="role === 'B'" class="text-field"><text>我观察到的主要差异 <text class="optional">选填</text></text><textarea v-model="mine.observedDifference" maxlength="300" placeholder="只描述你观察到的具体行为。" /><text>{{ mine.observedDifference.length }} / 300</text></label>
      <label v-if="role === 'B'" class="text-field"><text>文化背景为什么和这次有关 <text class="optional">选填</text></text><textarea v-model="mine.culturalContext" maxlength="300" placeholder="只在你认为确实有关时填写，不需要写籍贯或地址。" /><text>{{ mine.culturalContext.length }} / 300</text></label>
      <label class="ai-toggle"><switch :checked="mine.useCommunicationAi" color="#315847" @change="mine.useCommunicationAi = eventChecked($event)" /><view><text>供我的私人 AI 参考</text><text>用来选择更适合你的提问节奏</text></view></label>
    </template>

    <template v-else-if="step === 3 && role === 'A'">
      <ChoiceGroup label="你眼中的关系现在怎样？" :items="relationshipStateOptions" :model-value="mine.relationshipState" @update:model-value="mine.relationshipState = $event" />
      <label class="text-field"><text>我观察到的主要差异 <text class="optional">选填</text></text><textarea v-model="mine.observedDifference" maxlength="300" placeholder="写具体行为，不替对方定义人格。例如：我想马上说清，对方通常想先安静。" /><text>{{ mine.observedDifference.length }} / 300</text></label>
      <label class="text-field"><text>文化背景为什么和这次有关 <text class="optional">选填</text></text><textarea v-model="mine.culturalContext" maxlength="300" placeholder="只在你认为确实有关时填写，不需要写籍贯或地址。" /><text>{{ mine.culturalContext.length }} / 300</text></label>
    </template>

    <template v-else-if="step === 4">
      <view class="preview-section shared-preview">
        <text class="preview-title">{{ role === 'A' ? '会让对方确认' : '会分享给邀请方' }}</text>
        <template v-if="role === 'A' || decision === 'DIFFERENT'">
          <view class="preview-row"><text>关系</text><text>{{ relationshipLabel(mineShared) }}</text></view>
          <view class="preview-row"><text>时长</text><text>{{ optionLabel(durationOptions, mineShared.durationRange) }}</text></view>
          <view class="preview-row"><text>相处方式</text><text>{{ optionLabel(interactionOptions, mineShared.interactionMode) }}</text></view>
        </template>
        <text v-else>{{ decision === 'CONFIRMED' ? '只会让对方看到“你已确认”。' : '不会分享你的关系版本。' }}</text>
        <label v-if="role === 'A'" class="ai-toggle"><switch :checked="mineShared.useSharedAi" color="#315847" @change="mineShared.useSharedAi = eventChecked($event)" /><view><text>让我的私人 AI 参考这份关系背景</text><text>不影响共同 Agent，也不会代替受邀者确认</text></view></label>
      </view>

      <view v-if="role === 'B' && shared.status !== 'MISSING' && shared.status !== 'SKIPPED'" class="preview-section inviter-ai">
        <text class="preview-title">邀请方提供、我可以看到</text>
        <text>不开启时，这些内容只供你阅读，不会发送给模型。</text>
        <label class="ai-toggle"><switch :checked="mine.useInviterSharedAi" color="#315847" @change="mine.useInviterSharedAi = eventChecked($event)" /><view><text>让我的私人 AI 参考邀请方版本</text><text>默认关闭；不影响邀请方或共同 Agent</text></view></label>
      </view>

      <view class="preview-section private-preview">
        <text class="preview-title">只属于我</text>
        <view class="preview-row"><text>沟通节奏</text><text>{{ optionLabel(communicationPaceOptions, mine.communicationPace) }}</text></view>
        <view class="preview-row"><text>回应偏好</text><text>{{ optionLabel(responsePreferenceOptions, mine.responsePreference) }}</text></view>
        <view class="preview-row"><text>当前状态</text><text>{{ optionLabel(relationshipStateOptions, mine.relationshipState) }}</text></view>
        <label class="ai-toggle"><switch :checked="mine.useCommunicationAi" color="#315847" @change="mine.useCommunicationAi = eventChecked($event)" /><view><text>让私人 AI 参考沟通偏好</text><text>共同 Agent 永远不会读取这些资料</text></view></label>
        <label class="ai-toggle"><switch :checked="mine.useRelationshipStateAi" color="#315847" @change="mine.useRelationshipStateAi = eventChecked($event)" /><view><text>让私人 AI 参考当前关系状态</text><text>只用于这间房，不形成关系诊断</text></view></label>
        <label v-if="mine.observedDifference" class="ai-toggle"><switch :checked="mine.useDifferenceAi" color="#315847" @change="mine.useDifferenceAi = eventChecked($event)" /><view><text>让私人 AI 参考我观察到的差异</text><text>始终作为你的视角，不定义对方</text></view></label>
        <label v-if="mine.culturalContext" class="ai-toggle"><switch :checked="mine.useCultureAi" color="#315847" @change="mine.useCultureAi = eventChecked($event)" /><view><text>让私人 AI 参考文化说明</text><text>默认关闭，只有你主动开启才使用</text></view></label>
      </view>
    </template>

    <view class="flow-actions">
      <button v-if="step > 1" class="back" role="button" :tabindex="busy ? -1 : 0" :disabled="busy" @tap="previous" @keydown.enter.prevent="!busy && previous()" @keydown.space.prevent="!busy && previous()">返回上一步</button>
      <button v-else class="back" role="button" :tabindex="busy ? -1 : 0" :disabled="busy" @tap="$emit('leave')" @keydown.enter.prevent="!busy && $emit('leave')" @keydown.space.prevent="!busy && $emit('leave')">先离开</button>
      <button v-if="step < 4" class="next" role="button" :tabindex="busy || !canContinue ? -1 : 0" :disabled="busy || !canContinue" @tap="next" @keydown.enter.prevent="!busy && canContinue && next()" @keydown.space.prevent="!busy && canContinue && next()">继续</button>
      <button v-else class="next" role="button" :tabindex="busy ? -1 : 0" :loading="busy" :disabled="busy" @tap="submit" @keydown.enter.prevent="!busy && submit()" @keydown.space.prevent="!busy && submit()">{{ role === 'A' ? '保存背景并继续' : '保存我的选择' }}</button>
    </view>
    <text v-if="!canContinue" class="disabled-reason">{{ disabledReason }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, reactive, ref, watch, type PropType } from "vue";
import {
  communicationPaceOptions,
  durationOptions,
  emptyParticipantContextDraft,
  emptySharedContextDraft,
  interactionOptions,
  optionLabel,
  planningStyleOptions,
  relationshipStateOptions,
  relationshipTypeOptions,
  responsePreferenceOptions,
  type ParticipantContextDraft,
  type RoomRelationshipContext,
  type SharedContextDraft,
} from "../domain/profile-context";
import type { RelationshipDraft } from "../services/profile-context-session";

const ChoiceGroup = defineComponent({
  props: {
    label: { type: String, required: true },
    items: { type: Array as PropType<readonly { value: string; label: string }[]>, required: true },
    modelValue: { type: String as PropType<string | null>, default: null },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () => h("view", { class: "choice-group", role: "radiogroup", "aria-label": props.label }, [
      h("text", { class: "question" }, props.label),
      h("view", { class: "choice-grid" }, props.items.map((item) => h("button", {
        class: ["choice", { selected: props.modelValue === item.value }],
        role: "radio",
        tabindex: 0,
        "aria-checked": props.modelValue === item.value,
        onClick: () => emit("update:modelValue", props.modelValue === item.value ? null : item.value),
        onKeydown: (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          emit("update:modelValue", props.modelValue === item.value ? null : item.value);
        },
      }, item.label))),
    ]);
  },
});

const props = defineProps<{
  role: "A" | "B";
  context: RoomRelationshipContext;
  savedDraft: RelationshipDraft | null;
  busy: boolean;
  error: string;
}>();

const emit = defineEmits<{
  save: [payload: { status: "CONFIRMED" | "DIFFERENT" | "SKIPPED"; shared: SharedContextDraft; mine: ParticipantContextDraft }];
  checkpoint: [payload: { step: number; decision: "CONFIRMED" | "DIFFERENT" | "SKIPPED" | null; shared: SharedContextDraft; mine: ParticipantContextDraft }];
  "draft-change": [draft: RelationshipDraft];
  leave: [];
}>();

const decisions = [
  { value: "CONFIRMED", label: "符合我的理解", description: "邀请方会看到你已确认；共同 Agent 不会使用这些背景。" },
  { value: "DIFFERENT", label: "填写我的版本", description: "两种版本会并列，不由 AI 判断对错。" },
  { value: "SKIPPED", label: "暂不回答", description: "邀请方只会看到你暂未确认。" },
] as const;
const step = ref(1);
const decision = ref<"CONFIRMED" | "DIFFERENT" | "SKIPPED" | null>(null);
const shared = reactive({ ...props.context.shared });
const mineShared = reactive<SharedContextDraft>(emptySharedContextDraft());
const mine = reactive<ParticipantContextDraft>(emptyParticipantContextDraft());
const relationshipOther = ref("");
const headingRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null);

function headingElement() {
  const value = headingRef.value;
  if (!value) return null;
  if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) return value;
  return "$el" in value ? value.$el ?? null : null;
}

async function focusHeading() {
  if (typeof document === "undefined") return;
  await nextTick();
  headingElement()?.focus();
}

const heading = computed(() => {
  if (props.role === "B" && step.value === 1) return { title: "对方这样介绍你们的关系", description: "这是邀请方的版本，不是系统认定的事实。" };
  if (step.value === 1 || props.role === "B" && step.value === 2) return { title: props.role === "A" ? "先介绍一下你们" : "填写我的版本", description: "只选你愿意说明的部分，所有题都可以跳过。" };
  if (step.value === 2 || props.role === "B" && step.value === 3) return { title: "发生分歧时，你通常怎样沟通？", description: "这里只描述你自己，不评价对方。" };
  if (step.value === 3) return { title: "你眼中的关系现在怎样？", description: "这是你的私人视角，不会展示给对方。" };
  return { title: "确认这次会怎样使用", description: "提交前，逐项看清谁能看到、AI 会不会参考。" };
});

const isSharedStep = computed(() => step.value === 1 && props.role === "A" || step.value === 2 && props.role === "B" && decision.value === "DIFFERENT");
const canContinue = computed(() => {
  if (props.role === "B" && step.value === 1) return decision.value !== null;
  if (props.role === "B" && step.value === 2 && decision.value === "DIFFERENT") {
    return Boolean(mineShared.relationshipType || mineShared.durationRange || mineShared.interactionMode) &&
      (mineShared.relationshipType !== "OTHER" || Boolean(relationshipOther.value.trim()));
  }
  return mineShared.relationshipType !== "OTHER" || Boolean(relationshipOther.value.trim());
});
const disabledReason = computed(() => props.role === "B" && step.value === 1
  ? "请选择一种回应后继续。"
  : "选择“其他”时，请填写具体关系类型。" );

function load() {
  Object.assign(shared, props.context.shared);
  const source = props.savedDraft;
  if (source) {
    step.value = source.step;
    decision.value = source.decision ?? null;
    Object.assign(mineShared, source.shared);
    Object.assign(mine, source.mine);
  } else {
    step.value = props.role === "A" ? props.context.shared.draftStep : props.context.mine.draftStep;
    decision.value = props.context.mine.draftDecision ?? (props.context.mine.status === "DIFFERENT" ? "DIFFERENT"
      : props.context.mine.status === "CONFIRMED" ? "CONFIRMED"
        : props.context.mine.status === "SKIPPED" ? "SKIPPED" : null);
    if (props.role === "A") Object.assign(mineShared, props.context.shared);
    else Object.assign(mineShared, props.context.mine);
    Object.assign(mine, props.context.mine);
  }
  relationshipOther.value = mineShared.relationshipOther ?? "";
}

watch(() => props.context, load, { immediate: true });
watch(step, focusHeading);
onMounted(focusHeading);
watch([step, decision, mineShared, mine, relationshipOther], () => {
  mineShared.relationshipOther = mineShared.relationshipType === "OTHER" ? relationshipOther.value : null;
  emit("draft-change", {
    step: step.value,
    ...(decision.value ? { decision: decision.value } : {}),
    shared: { ...mineShared }, mine: { ...mine },
    sharedRevision: props.context.shared.revision,
    privateRevision: props.context.mine.revision,
  });
}, { deep: true, flush: "sync" });

function relationshipLabel(value: { relationshipType: string | null; relationshipOther: string | null }) {
  if (value.relationshipType === "OTHER") return value.relationshipOther || "其他";
  return optionLabel(relationshipTypeOptions, value.relationshipType);
}

function eventChecked(event: Event) {
  return Boolean((event as unknown as { detail?: { value?: boolean } }).detail?.value);
}

function next() {
  if (!canContinue.value) return;
  if (props.role === "B" && step.value === 1 && decision.value !== "DIFFERENT") step.value = 3;
  else step.value = Math.min(4, step.value + 1);
  emit("checkpoint", {
    step: step.value,
    decision: decision.value,
    shared: { ...mineShared },
    mine: currentMinePayload(),
  });
}

function previous() {
  if (props.role === "B" && step.value === 3 && decision.value !== "DIFFERENT") step.value = 1;
  else step.value = Math.max(1, step.value - 1);
}

function saveSkipped() {
  emit("save", { status: "SKIPPED", shared: emptySharedContextDraft(), mine: emptyParticipantContextDraft() });
}

function submit() {
  const status = props.role === "A" ? "CONFIRMED" : decision.value ?? "SKIPPED";
  emit("save", {
    status,
    shared: { ...mineShared },
    mine: currentMinePayload(),
  });
}

function currentMinePayload(): ParticipantContextDraft {
  return props.role === "B" && decision.value === "DIFFERENT"
    ? {
      ...mine,
      relationshipType: mineShared.relationshipType,
      relationshipOther: mineShared.relationshipOther,
      durationRange: mineShared.durationRange,
      interactionMode: mineShared.interactionMode,
    }
    : { ...mine };
}
</script>

<style scoped lang="scss">
.relationship-flow { width: min(100%, 720px); margin: 0 auto; padding: 10rpx 0 50rpx; color: #1c2923; }
.flow-heading { margin-bottom: 28rpx; }
.eyebrow, .progress, .title, .description, .question, .optional-note, .version-label, .decision-title, .decision-copy, .preview-title, .text-field > text { display: block; }
.eyebrow { color: #be442e; font-size: 21rpx; font-weight: 900; letter-spacing: .16em; }
.progress { margin-top: 10rpx; color: #68726c; font-size: 22rpx; }
.title { margin-top: 16rpx; font-family: serif; font-size: 48rpx; font-weight: 800; line-height: 1.18; }
.description { margin-top: 13rpx; color: #68726c; font-size: 25rpx; line-height: 1.65; }
.flow-error { margin-bottom: 20rpx; padding: 18rpx 20rpx; border-left: 6rpx solid #be442e; background: #fff0ec; color: #8e2d1c; font-size: 23rpx; line-height: 1.55; }
.skip-top { min-height: 44px; margin-bottom: 16rpx; border: 0; background: transparent; color: #315847; font-size: 23rpx; text-decoration: underline; }
:deep(.choice-group) { margin-top: 28rpx; }
:deep(.question) { margin-bottom: 14rpx; font-size: 27rpx; font-weight: 800; }
:deep(.choice-grid) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12rpx; }
:deep(.choice) { min-height: 48px; padding: 16rpx 18rpx; border: 2rpx solid #d0cec6; border-radius: 16rpx; background: #fff; color: #34433c; font-size: 23rpx; line-height: 1.35; }
:deep(.choice.selected) { border-color: #315847; background: #e7efe9; color: #214b39; font-weight: 800; }
.custom-field, .text-field { display: block; margin-top: 18rpx; }
.custom-field label { display: block; margin-bottom: 10rpx; font-size: 23rpx; font-weight: 800; }
.custom-field input { box-sizing: border-box; width: 100%; min-height: 48px; padding: 0 18rpx; border: 2rpx solid #c8c7bf; border-radius: 14rpx; background: #fff; }
.custom-field > text, .text-field > text:last-child { display: block; margin-top: 7rpx; color: #68726c; font-size: 20rpx; text-align: right; }
.optional-note { margin-top: 24rpx; padding: 20rpx; border-radius: 14rpx; background: #f1eee6; color: #59665f; font-size: 22rpx; line-height: 1.6; }
.ai-toggle { display: flex; align-items: center; gap: 16rpx; min-height: 48px; margin-top: 24rpx; color: #264738; font-size: 23rpx; }
.ai-toggle view text { display: block; }
.ai-toggle view text:last-child { margin-top: 4rpx; color: #68726c; font-size: 20rpx; }
.text-field > text:first-child { margin-bottom: 10rpx; font-size: 25rpx; font-weight: 800; }
.optional { color: #68726c; font-size: 20rpx; font-weight: 600; }
.text-field textarea { box-sizing: border-box; width: 100%; min-height: 190rpx; padding: 18rpx; border: 2rpx solid #c8c7bf; border-radius: 16rpx; background: #fff; font-size: 25rpx; line-height: 1.6; }
.inviter-version, .preview-section { margin-top: 22rpx; padding: 24rpx; border-radius: 20rpx; background: #f0ede4; }
.version-label, .preview-title { margin-bottom: 15rpx; color: #315847; font-size: 23rpx; font-weight: 900; }
.summary-list, .preview-section { display: grid; gap: 12rpx; }
.summary-list view, .preview-row { display: flex; justify-content: space-between; gap: 20rpx; color: #536159; font-size: 23rpx; }
.summary-list view text:last-child, .preview-row text:last-child { color: #1c2923; font-weight: 800; text-align: right; }
.empty-copy { color: #59665f; font-size: 23rpx; line-height: 1.6; }
.decision-list { display: grid; gap: 13rpx; margin-top: 24rpx; }
.decision { min-height: 68px; padding: 20rpx; border: 2rpx solid #d0cec6; border-radius: 18rpx; background: #fff; text-align: left; }
.decision.selected { border-color: #315847; background: #e7efe9; }
.decision-title { color: #1c2923; font-size: 25rpx; font-weight: 900; }
.decision-copy { margin-top: 5rpx; color: #68726c; font-size: 21rpx; line-height: 1.5; }
.shared-preview { border: 2rpx solid #e2b8ae; background: #fff3ef; }
.private-preview, .inviter-ai { border: 2rpx solid #c8dacd; background: #edf4ef; }
.preview-section > text:not(.preview-title) { color: #58665f; font-size: 22rpx; line-height: 1.6; }
.flow-actions { display: grid; grid-template-columns: 1fr 1.5fr; gap: 13rpx; margin-top: 32rpx; padding-bottom: env(safe-area-inset-bottom); }
.flow-actions button { min-height: 50px; border-radius: 16rpx; font-size: 25rpx; font-weight: 900; }
.back { border: 2rpx solid #315847; background: #fffdf8; color: #315847; }
.next { border: 0; background: #be442e; color: #fff; }
.next[disabled] { opacity: .52; }
.disabled-reason { display: block; margin-top: 10rpx; color: #8d2f1f; font-size: 21rpx; text-align: right; }
@media (min-width: 760px) { :deep(.choice-grid) { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
