<template>
  <view class="relationship-flow">
    <view ref="headingRef" class="flow-heading" tabindex="-1">
      <text class="eyebrow">{{ role === 'A' ? '发起沟通前' : '接受邀请前' }}</text>
      <text class="progress" role="status">第 {{ step }} 步，共 4 步</text>
      <text class="title">{{ heading.title }}</text>
      <text class="description">{{ heading.description }}</text>
    </view>

    <view v-if="error" ref="errorRef" class="flow-error" role="alert" tabindex="-1">{{ error }}</view>

    <template v-if="role === 'B' && step === 1">
      <view class="inviter-version">
        <text class="version-label">{{ hasConfirmableInviterVersion ? '邀请方版本 · 尚未由你确认' : '暂无可确认的邀请方版本' }}</text>
        <view v-if="!hasConfirmableInviterVersion" class="empty-copy">{{ missingInviterCopy }}</view>
        <view v-else class="summary-list">
          <view><text>关系</text><text>{{ relationshipLabel(shared) }}</text></view>
          <view><text>相处时间</text><text>{{ optionLabel(durationOptions, shared.durationRange) }}</text></view>
          <template v-if="hasContactHistory(shared.contactHistory)">
            <view><text>现在住得近吗</text><text>{{ optionLabel(proximityOptions, shared.contactHistory.currentProximity) }}</text></view>
            <view><text>现在多久见面</text><text>{{ optionLabel(meetingFrequencyOptions, shared.contactHistory.currentFrequency) }}</text></view>
            <view v-if="shared.contactHistory.changed"><text>以前也这样吗</text><text>{{ optionLabel(changeOptions, shared.contactHistory.changed) }}</text></view>
            <view v-if="shared.contactHistory.changed === 'YES'"><text>以前住得近吗</text><text>{{ optionLabel(proximityOptions, shared.contactHistory.previousProximity) }}</text></view>
            <view v-if="shared.contactHistory.changed === 'YES'"><text>以前多久见面</text><text>{{ optionLabel(meetingFrequencyOptions, shared.contactHistory.previousFrequency) }}</text></view>
            <view v-if="shared.contactHistory.changed === 'YES'"><text>变化开始于</text><text>{{ optionLabel(changeTimeOptions, shared.contactHistory.changeTime) }}</text></view>
          </template>
          <view v-else><text>相处方式（旧记录）</text><text>{{ optionLabel(interactionOptions, shared.interactionMode) }}</text></view>
        </view>
      </view>
      <view class="decision-list" role="radiogroup" :aria-label="decisionGroupLabel">
        <button v-for="item in decisions" :key="item.value" class="decision" :class="{ selected: decision === item.value }" role="radio" tabindex="0" :aria-checked="decision === item.value" @tap="decision = item.value" @keydown.enter.prevent="decision = item.value" @keydown.space.prevent="decision = item.value">
          <text class="decision-title">{{ item.label }}</text><text class="decision-copy">{{ item.description }}</text>
        </button>
      </view>
    </template>

    <template v-else-if="isSharedStep">
      <button v-if="role === 'A'" class="skip-top" role="button" tabindex="0" @tap="saveSkipped" @keydown.enter.prevent="saveSkipped" @keydown.space.prevent="saveSkipped">暂不说明关系，继续沟通</button>
      <ChoiceGroup label="你们是什么关系？" :items="relationshipTypeOptions" :model-value="mineShared.relationshipType" @update:model-value="mineShared.relationshipType = $event" />
      <view v-if="mineShared.relationshipType === 'OTHER'" class="custom-field">
        <label for="relationship-other">其他关系类型</label>
        <input id="relationship-other" v-model="relationshipOther" maxlength="30" placeholder="例如：室友" />
        <text>{{ relationshipOther.length }} / 30</text>
      </view>
      <ChoiceGroup label="大约相处多久了？" :items="durationOptions" :model-value="mineShared.durationRange" @update:model-value="mineShared.durationRange = $event" />
      <ChoiceGroup label="现在住得近吗？" :items="proximityOptions" :model-value="mineShared.contactHistory.currentProximity" @update:model-value="mineShared.contactHistory.currentProximity = $event" />
      <ChoiceGroup label="现在大约多久见一次？" :items="meetingFrequencyOptions" :model-value="mineShared.contactHistory.currentFrequency" @update:model-value="mineShared.contactHistory.currentFrequency = $event" />
      <ChoiceGroup label="以前也是这样吗？" :items="changeOptions" :model-value="mineShared.contactHistory.changed" @update:model-value="setChanged($event)" />
      <template v-if="mineShared.contactHistory.changed === 'YES'">
        <ChoiceGroup label="以前住得近吗？" :items="proximityOptions" :model-value="mineShared.contactHistory.previousProximity" @update:model-value="mineShared.contactHistory.previousProximity = $event" />
        <ChoiceGroup label="以前大约多久见一次？" :items="meetingFrequencyOptions" :model-value="mineShared.contactHistory.previousFrequency" @update:model-value="mineShared.contactHistory.previousFrequency = $event" />
        <ChoiceGroup label="这种变化大约从什么时候开始？" :items="changeTimeOptions" :model-value="mineShared.contactHistory.changeTime" @update:model-value="mineShared.contactHistory.changeTime = $event" />
      </template>
      <text class="optional-note">这是你的版本，不是系统认定的事实。对方可以确认、填写自己的版本或暂不回答。</text>
    </template>

    <template v-else-if="step === 2 && role === 'A' || step === 3 && role === 'B'">
      <ChoiceGroup :index="1" label="发生分歧时，你通常会？" :items="communicationPaceOptions" :model-value="mine.communicationPace" @update:model-value="mine.communicationPace = $event" />
      <ChoiceGroup :index="2" label="你更希望先得到什么？" :items="responsePreferenceOptions" :model-value="mine.responsePreference" @update:model-value="mine.responsePreference = $event" />
      <ChoiceGroup :index="3" label="一起行动时，你通常偏向？" :items="planningStyleOptions" :model-value="mine.planningStyle" @update:model-value="mine.planningStyle = $event" />
      <ChoiceGroup v-if="role === 'B'" label="你眼中的关系现在怎样？" :items="relationshipStateOptions" :model-value="mine.relationshipState" @update:model-value="mine.relationshipState = $event" />
      <label v-if="role === 'B'" class="text-field"><text>我观察到的主要差异 <text class="optional">选填</text></text><textarea v-model="mine.observedDifference" maxlength="300" placeholder="只描述你观察到的具体行为。" /><text>{{ mine.observedDifference.length }} / 300</text></label>
      <label v-if="role === 'B'" class="text-field"><text>文化背景为什么和这次有关 <text class="optional">选填</text></text><textarea v-model="mine.culturalContext" maxlength="300" placeholder="只在你认为确实有关时填写，不需要写籍贯或地址。" /><text>{{ mine.culturalContext.length }} / 300</text></label>
      <label class="ai-toggle"><switch :checked="mine.useCommunicationAi" color="#315847" @change="mine.useCommunicationAi = eventChecked($event)" /><view><text>供我的私人 AI 参考</text><text>对方不可见，共同 Agent 不会读取</text></view></label>
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
          <template v-if="hasContactHistory(mineShared.contactHistory)">
            <view class="preview-row"><text>现在住得近吗</text><text>{{ optionLabel(proximityOptions, mineShared.contactHistory.currentProximity) }}</text></view>
            <view class="preview-row"><text>现在多久见面</text><text>{{ optionLabel(meetingFrequencyOptions, mineShared.contactHistory.currentFrequency) }}</text></view>
            <view v-if="mineShared.contactHistory.changed" class="preview-row"><text>以前也这样吗</text><text>{{ optionLabel(changeOptions, mineShared.contactHistory.changed) }}</text></view>
            <view v-if="mineShared.contactHistory.changed === 'YES'" class="preview-row"><text>以前住得近吗</text><text>{{ optionLabel(proximityOptions, mineShared.contactHistory.previousProximity) }}</text></view>
            <view v-if="mineShared.contactHistory.changed === 'YES'" class="preview-row"><text>以前多久见面</text><text>{{ optionLabel(meetingFrequencyOptions, mineShared.contactHistory.previousFrequency) }}</text></view>
            <view v-if="mineShared.contactHistory.changed === 'YES'" class="preview-row"><text>变化开始于</text><text>{{ optionLabel(changeTimeOptions, mineShared.contactHistory.changeTime) }}</text></view>
          </template>
          <view v-else-if="mineShared.interactionMode" class="preview-row"><text>相处方式（旧记录）</text><text>{{ optionLabel(interactionOptions, mineShared.interactionMode) }}</text></view>
        </template>
        <text v-else>{{ decision === 'CONFIRMED' ? '只会让对方看到“你已确认”。' : '不会分享你的关系版本。' }}</text>
        <label v-if="role === 'A'" class="ai-toggle"><switch :checked="mineShared.useSharedAi" color="#315847" @change="mineShared.useSharedAi = eventChecked($event)" /><view><text>让我的私人 AI 参考这份关系背景</text><text>不影响共同 Agent，也不会代替受邀者确认</text></view></label>
      </view>

      <view v-if="role === 'B' && hasConfirmableInviterVersion" class="preview-section inviter-ai">
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

    <view class="flow-footer">
      <text v-if="!canContinue" class="disabled-reason" role="status">{{ disabledReason }}</text>
      <view class="flow-actions" :class="{ single: step === 1 }">
        <button v-if="step > 1" class="back" role="button" :tabindex="busy ? -1 : 0" :disabled="busy" @tap="previous" @keydown.enter.prevent="!busy && previous()" @keydown.space.prevent="!busy && previous()">返回上一步</button>
        <button v-if="step < 4" class="next" role="button" :tabindex="busy || !canContinue ? -1 : 0" :loading="busy" :disabled="busy || !canContinue" @tap="next" @keydown.enter.prevent="!busy && canContinue && next()" @keydown.space.prevent="!busy && canContinue && next()">继续</button>
        <button v-else class="next" role="button" :tabindex="busy ? -1 : 0" :loading="busy" :disabled="busy" @tap="submit" @keydown.enter.prevent="!busy && submit()" @keydown.space.prevent="!busy && submit()">{{ role === 'A' ? '保存背景并继续' : '保存我的选择' }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, reactive, ref, watch, type PropType } from "vue";
import {
  communicationPaceOptions,
  changeTimeOptions,
  durationOptions,
  emptyContactHistory,
  emptyParticipantContextDraft,
  emptySharedContextDraft,
  hasCurrentContactAnswer,
  interactionOptions,
  meetingFrequencyOptions,
  optionLabel,
  planningStyleOptions,
  proximityOptions,
  relationshipStateOptions,
  relationshipTypeOptions,
  responsePreferenceOptions,
  toParticipantContextDraft,
  toSharedContextDraft,
  type ParticipantContextDraft,
  type RoomRelationshipContext,
  type SharedContextDraft,
} from "../domain/profile-context";
import type { RelationshipDraft } from "../services/profile-context-session";
import {
  normalizeRecipientRelationshipDecision,
  recipientRelationshipDecisions,
  type RecipientRelationshipDecision,
} from "../services/relationship-onboarding-flow";

const ChoiceGroup = defineComponent({
  props: {
    label: { type: String, required: true },
    items: { type: Array as PropType<readonly { value: string; label: string }[]>, required: true },
    modelValue: { type: String as PropType<string | null>, default: null },
    index: { type: Number, default: 0 },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () => h("view", { class: "choice-group", role: "radiogroup", "aria-label": props.label }, [
      h("view", { class: "question-row" }, [
        props.index ? h("text", { class: "question-index", "aria-hidden": "true" }, String(props.index).padStart(2, "0")) : null,
        h("text", { class: "question" }, props.label),
      ]),
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
      }, [
        h("text", { class: "choice-label" }, item.label),
        props.modelValue === item.value ? h("text", { class: "choice-check", "aria-hidden": "true" }, "✓") : null,
      ]))),
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
  "step-change": [step: number];
  leave: [];
}>();

const decisionOptions = [
  { value: "CONFIRMED", label: "符合我的理解", description: "邀请方会看到你已确认；共同 Agent 不会使用这些背景。" },
  { value: "DIFFERENT", label: "填写我的版本", description: "你的版本会单独保存，不由 AI 判断对错。" },
  { value: "SKIPPED", label: "暂不回答", description: "邀请方只会看到你暂未提供自己的版本。" },
] as const;
const changeOptions = [
  { value: "NO", label: "是，差不多" },
  { value: "YES", label: "不是，发生了变化" },
] as const;
function hasContactHistory(value: SharedContextDraft["contactHistory"]) {
  return Object.values(value).some((answer) => answer !== null);
}
const step = ref(1);
const decision = ref<RecipientRelationshipDecision | null>(null);
const shared = reactive({ ...props.context.shared });
const mineShared = reactive<SharedContextDraft>(emptySharedContextDraft());
const mine = reactive<ParticipantContextDraft>(emptyParticipantContextDraft());
const relationshipOther = ref("");
const headingRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
const errorRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
const hasConfirmableInviterVersion = computed(() => shared.status === "CONFIRMED");
const decisions = computed(() => {
  const allowed = recipientRelationshipDecisions(shared.status);
  return decisionOptions.filter((item) => allowed.includes(item.value));
});
const missingInviterCopy = computed(() => shared.status === "SKIPPED"
  ? "邀请方选择不提供关系背景。你可以填写自己的版本，也可以暂不回答。"
  : "当前没有邀请方版本可供确认。你可以填写自己的版本，也可以暂不回答。");
const decisionGroupLabel = computed(() => hasConfirmableInviterVersion.value
  ? "邀请方的关系背景是否符合我的理解"
  : "没有邀请方关系版本时我想怎样继续");

function element(value: HTMLElement | { $el?: HTMLElement } | null) {
  if (!value) return null;
  if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) return value;
  return "$el" in value ? value.$el ?? null : null;
}

async function focusHeading() {
  if (typeof document === "undefined") return;
  await nextTick();
  element(headingRef.value)?.focus();
}

async function focusError() {
  if (typeof document === "undefined") return;
  await nextTick();
  element(errorRef.value)?.focus();
}

function backOrLeave() {
  if (step.value > 1) previous();
  else emit("leave");
}

defineExpose({ focusError, backOrLeave });

const heading = computed(() => {
  if (props.role === "B" && step.value === 1) return hasConfirmableInviterVersion.value
    ? { title: "对方这样介绍你们的关系", description: "这是邀请方的版本，不是系统认定的事实。" }
    : { title: "邀请方没有说明你们的关系", description: "你仍然可以填写自己的版本，或暂不回答。" };
  if (step.value === 1 || props.role === "B" && step.value === 2) {
    return props.role === "A"
      ? { title: "你准备邀请谁来沟通？", description: "先选择你理解的关系。对方可以确认、填写自己的版本或暂不回答。" }
      : { title: "填写我的版本", description: "只选你愿意说明的部分，所有题都可以跳过。" };
  }
  if (step.value === 2 || props.role === "B" && step.value === 3) return { title: "发生分歧时，你通常怎样沟通？", description: "这里只描述你自己，不评价对方。" };
  if (step.value === 3) return { title: "你眼中的关系现在怎样？", description: "这是你的私人视角，不会展示给对方。" };
  return { title: "确认这次会怎样使用", description: "提交前，逐项看清谁能看到、AI 会不会参考。" };
});

const isSharedStep = computed(() => step.value === 1 && props.role === "A" || step.value === 2 && props.role === "B" && decision.value === "DIFFERENT");
const canContinue = computed(() => {
  if (props.role === "B" && step.value === 1) return decision.value !== null;
  if (props.role === "B" && step.value === 2 && decision.value === "DIFFERENT") {
    return Boolean(mineShared.relationshipType || mineShared.durationRange || mineShared.interactionMode || hasContactHistory(mineShared.contactHistory)) &&
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
    decision.value = normalizeRecipientRelationshipDecision(source.decision ?? null, shared.status);
    step.value = props.role === "B" && !decision.value ? 1 : source.step;
    Object.assign(mineShared, source.shared);
    Object.assign(mine, source.mine);
  } else {
    const restoredStep = props.role === "A" ? props.context.shared.draftStep : props.context.mine.draftStep;
    decision.value = normalizeRecipientRelationshipDecision(props.context.mine.draftDecision ?? (props.context.mine.status === "DIFFERENT" ? "DIFFERENT"
      : props.context.mine.status === "CONFIRMED" ? "CONFIRMED"
        : props.context.mine.status === "SKIPPED" ? "SKIPPED" : null), shared.status);
    step.value = props.role === "B" && !decision.value ? 1 : restoredStep;
    if (props.role === "A") Object.assign(mineShared, toSharedContextDraft(props.context.shared));
    else Object.assign(mineShared, toSharedContextDraft(props.context.mine));
    Object.assign(mine, toParticipantContextDraft(props.context.mine));
  }
  relationshipOther.value = mineShared.relationshipOther ?? "";
}

watch(() => props.context, load, { immediate: true });
watch(step, (value) => {
  emit("step-change", value);
  void focusHeading();
}, { immediate: true });
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

function setChanged(value: "YES" | "NO" | null) {
  mineShared.contactHistory.changed = value;
  if (value !== "YES") Object.assign(mineShared.contactHistory, {
    ...emptyContactHistory(),
    currentProximity: mineShared.contactHistory.currentProximity,
    currentFrequency: mineShared.contactHistory.currentFrequency,
    changed: value,
  });
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
      interactionMode: hasCurrentContactAnswer(mineShared.contactHistory) ? null : mineShared.interactionMode,
      contactHistory: mineShared.contactHistory,
    }
    : { ...mine };
}
</script>

<style scoped lang="scss">
.relationship-flow {
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  padding: 28px 24px 130px;
  color: #1c2923;
  box-sizing: border-box;
}

.flow-heading { margin-bottom: 28px; outline: none; }
.eyebrow, .progress, .title, .description, .question, .optional-note, .version-label, .decision-title, .decision-copy, .preview-title, .text-field > text { display: block; }
.eyebrow { color: #be442e; font-size: 12px; font-weight: 900; letter-spacing: .18em; }
.progress { margin-top: 10px; color: #68726c; font-size: 13px; }
.title { margin-top: 14px; font-family: "Songti SC", "STSong", serif; font-size: 30px; font-weight: 800; line-height: 1.25; letter-spacing: -.4px; }
.description { margin-top: 10px; color: #68726c; font-size: 15px; line-height: 1.65; }
.flow-error { margin-bottom: 18px; padding: 14px 16px; border-left: 3px solid #be442e; border-radius: 0 12px 12px 0; background: #fff0ec; color: #8e2d1c; font-size: 14px; line-height: 1.55; outline: none; }
.skip-top { min-height: 48px; margin: -10px 0 8px auto; padding: 0; border: 0; background: transparent; color: #315847; font-size: 14px; text-decoration: underline; }

:deep(.choice-group) { margin-top: 28px; }
:deep(.question-row) { min-height: 24px; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
:deep(.question-index) { min-width: 30px; color: #be442e; font-size: 11px; font-weight: 800; letter-spacing: .06em; }
:deep(.question) { flex: 1; font-size: 17px; font-weight: 800; line-height: 1.4; }
:deep(.choice-grid) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
:deep(.choice) { min-height: 52px; padding: 10px 12px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid #d0cec6; border-radius: 12px; background: #fffdf9; color: #34433c; font-size: 14px; line-height: 1.35; }
:deep(.choice:last-child:nth-child(odd)) { grid-column: 1 / -1; }
:deep(.choice-label) { min-width: 0; }
:deep(.choice-check) { width: 20px; height: 20px; flex: 0 0 20px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #315847; color: #fff; font-size: 12px; font-weight: 900; }
:deep(.choice.selected) { border-color: #315847; background: #e7efe9; color: #214b39; font-weight: 800; box-shadow: inset 0 0 0 1px #315847; }

.custom-field, .text-field { display: block; margin-top: 20px; }
.custom-field label { display: block; margin-bottom: 8px; font-size: 15px; font-weight: 800; }
.custom-field input { box-sizing: border-box; width: 100%; min-height: 48px; padding: 0 14px; border: 1px solid #c8c7bf; border-radius: 12px; background: #fffdf9; }
.custom-field > text, .text-field > text:last-child { display: block; margin-top: 6px; color: #68726c; font-size: 12px; text-align: right; }
.optional-note { margin-top: 24px; padding: 16px; border-radius: 12px; background: #eee9de; color: #59665f; font-size: 13px; line-height: 1.65; }
.ai-toggle { min-height: 64px; margin-top: 22px; padding: 8px 0; display: flex; align-items: center; gap: 14px; color: #264738; font-size: 15px; box-sizing: border-box; }
.ai-toggle view { flex: 1; min-width: 0; }
.ai-toggle view text { display: block; }
.ai-toggle view text:last-child { margin-top: 4px; color: #68726c; font-size: 12px; line-height: 1.5; }
.text-field > text:first-child { margin-bottom: 9px; font-size: 16px; font-weight: 800; }
.optional { color: #68726c; font-size: 12px; font-weight: 600; }
.text-field textarea { box-sizing: border-box; width: 100%; min-height: 112px; padding: 14px; border: 1px solid #c8c7bf; border-radius: 12px; background: #fffdf9; font-size: 15px; line-height: 1.6; }

.inviter-version, .preview-section { margin-top: 20px; padding: 18px; border-radius: 16px; background: #f0ede4; }
.version-label, .preview-title { margin-bottom: 12px; color: #315847; font-size: 15px; font-weight: 900; }
.summary-list, .preview-section { display: grid; gap: 10px; }
.summary-list view, .preview-row { min-height: 26px; display: flex; justify-content: space-between; gap: 18px; color: #536159; font-size: 14px; }
.summary-list view text:last-child, .preview-row text:last-child { color: #1c2923; font-weight: 800; text-align: right; }
.empty-copy { color: #59665f; font-size: 14px; line-height: 1.6; }
.decision-list { display: grid; gap: 10px; margin-top: 22px; }
.decision { min-height: 76px; padding: 16px; border: 1px solid #d0cec6; border-radius: 14px; background: #fffdf9; text-align: left; }
.decision.selected { border-color: #315847; background: #e7efe9; box-shadow: inset 0 0 0 1px #315847; }
.decision-title { color: #1c2923; font-size: 16px; font-weight: 900; }
.decision-copy { margin-top: 5px; color: #68726c; font-size: 13px; line-height: 1.5; }
.shared-preview { border: 1px solid #e3b3a8; background: #fff3ef; }
.private-preview, .inviter-ai { border: 1px solid #c5d9ca; background: #edf4ef; }
.preview-section > text:not(.preview-title) { color: #58665f; font-size: 13px; line-height: 1.6; }

.flow-footer { position: fixed; z-index: 18; right: 0; bottom: 0; left: 50%; width: 100%; max-width: 430px; padding: 14px 24px calc(14px + env(safe-area-inset-bottom)); transform: translateX(-50%); background: linear-gradient(180deg, rgba(243, 239, 230, 0) 0, rgba(243, 239, 230, .96) 18px, #f3efe6 34px); box-sizing: border-box; }
.flow-actions { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.45fr); gap: 10px; padding-top: 20px; }
.flow-actions.single { grid-template-columns: 1fr; }
.flow-actions button { width: 100%; min-height: 56px; border-radius: 12px; font-size: 16px; font-weight: 900; }
.back { border: 1px solid #315847; background: #fffdf8; color: #315847; }
.next { border: 0; background: #c7432d; color: #fff; box-shadow: 0 8px 18px rgba(190, 68, 46, .18); }
.next[disabled] { opacity: .48; box-shadow: none; }
.disabled-reason { display: block; min-height: 20px; color: #8d2f1f; font-size: 12px; text-align: right; }

@media (max-width: 359px) {
  .title { font-size: 27px; }
  :deep(.choice) { padding-right: 9px; padding-left: 9px; font-size: 13px; }
  .flow-footer { padding-right: 18px; padding-left: 18px; }
  .flow-actions button { font-size: 14px; }
}
</style>
