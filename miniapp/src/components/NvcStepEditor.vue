<template>
  <view class="screen nvc-step-screen">
    <view class="nvc-step-meta">
      <text>非暴力沟通</text>
      <text>{{ index + 1 }} / {{ nvcPerspectiveCards.length }}</text>
    </view>
    <text class="eyebrow">{{ card.label }}</text>
    <text class="title">{{ card.question }}</text>
    <view class="nvc-editor-card" :class="`tone-${index}`">
      <text class="nvc-card-stem">{{ card.stem }}</text>
      <text class="nvc-card-guide">{{ card.guide }}</text>
      <textarea
        :value="modelValue"
        class="nvc-textarea"
        :maxlength="1000"
        :placeholder="card.placeholder"
        @input="updateValue"
      />
      <text class="nvc-card-count">{{ modelValue.length }} / 1000</text>
    </view>
    <view class="nvc-step-rail" aria-label="非暴力沟通四步进度">
      <view
        v-for="(step, stepIndex) in nvcPerspectiveCards"
        :key="step.key"
        class="nvc-step-node"
        :class="{ active: stepIndex === index, complete: perspective[step.key].trim().length > 0 }"
      >
        <text class="nvc-step-dot">{{ stepIndex < index || perspective[step.key].trim() ? "✓" : stepIndex + 1 }}</text>
        <text>{{ step.label }}</text>
      </view>
    </view>
    <text class="privacy-note">🔒 {{ privacyNote }}</text>
  </view>
</template>

<script setup lang="ts">
import type { NvcPerspectiveCard } from "../domain/nvc";
import { nvcPerspectiveCards } from "../domain/nvc";
import type { Perspective } from "../domain/types";

defineProps<{
  card: NvcPerspectiveCard;
  index: number;
  modelValue: string;
  perspective: Perspective;
  privacyNote: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function updateValue(event: Event) {
  const value = (event as unknown as { detail: { value: string } }).detail.value;
  emit("update:modelValue", value);
}
</script>

<style scoped lang="scss">
$paper: #f3efe6;
$surface: #fffdf8;
$ink: #1c2923;
$coral: #df5b3f;
$coral-dark: #be442e;
$green: #315b47;

.nvc-step-meta {
  margin-bottom: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: $coral-dark;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 2px;
}

.nvc-editor-card {
  position: relative;
  margin-top: 24px;
  padding: 18px;
  border: 1px solid rgba(49, 91, 71, .08);
  border-radius: 14px;
  box-shadow: 0 16px 36px rgba(28, 41, 35, .05);
}

.tone-0 { background: #e8eee8; }
.tone-1 { background: #f4e2d8; }
.tone-2 { background: #f2e8cf; }
.tone-3 { background: #dce9e7; }

.nvc-card-stem {
  display: block;
  margin-top: 9px;
  color: $ink;
  font-family: "Songti SC", "STSong", serif;
  font-size: 17px;
  font-weight: 700;
}

.nvc-card-guide {
  display: block;
  margin-top: 5px;
  color: rgba(28, 41, 35, .62);
  font-size: 10px;
  line-height: 1.55;
}

.nvc-textarea {
  width: 100%;
  min-height: 220px;
  margin-top: 16px;
  padding: 15px;
  border: 1px solid rgba(28, 41, 35, .12);
  border-radius: 10px;
  background: rgba(255, 253, 248, .86);
  box-sizing: border-box;
  color: $ink;
  font-size: 15px;
  line-height: 1.7;
}

.nvc-card-count {
  display: block;
  color: rgba(28, 41, 35, .42);
  font-size: 9px;
  text-align: right;
}

.nvc-step-rail {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
}

.nvc-step-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: rgba(28, 41, 35, .45);
  font-size: 9px;
}

.nvc-step-node::before {
  position: absolute;
  z-index: 0;
  top: 11px;
  right: 50%;
  width: calc(100% + 5px);
  height: 1px;
  background: rgba(49, 91, 71, .14);
  content: "";
}

.nvc-step-node:first-child::before { display: none; }

.nvc-step-dot {
  position: relative;
  z-index: 1;
  width: 23px;
  height: 23px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(49, 91, 71, .2);
  border-radius: 50%;
  background: $paper;
  font-size: 9px;
}

.nvc-step-node.active { color: $coral-dark; font-weight: 800; }
.nvc-step-node.active .nvc-step-dot { border-color: $coral; background: $coral; color: #fff; }
.nvc-step-node.complete:not(.active) .nvc-step-dot { border-color: $green; background: $green; color: #fff; }

@media (max-width: 360px) {
  .nvc-editor-card { padding: 15px; }
  .nvc-textarea { min-height: 190px; }
}
</style>
