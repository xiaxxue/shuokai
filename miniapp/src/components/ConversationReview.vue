<template>
  <view class="review-screen">
    <view class="candidate-status">
      <view class="status-seal">AI</view>
      <view>
        <text class="status-title">根据刚才的私人对话整理</text>
        <text class="status-note">候选 · 尚未共享</text>
      </view>
    </view>

    <text class="title">看看这版，还是不是你想说的话。</text>
    <text class="description">这不是答案，也不会自动发给对方。你可以直接修改，或者回到对话继续讲。</text>

    <view v-if="modelValue.safetyDisposition !== 'ALLOW'" class="safety-card" :class="`safety-${modelValue.safetyDisposition.toLowerCase()}`">
      <text class="safety-label">{{ safetyLabel }}</text>
      <text class="safety-copy">{{ modelValue.safetyMessage || "请先确认当前情境是否适合继续。" }}</text>
    </view>

    <view class="source-fold">
      <view class="source-heading"><text>刚才由你说出的原话</text><text>仅自己可见</text></view>
      <text class="source-copy">{{ sourceText }}</text>
    </view>

    <button class="return-conversation" @tap="$emit('continue-talking')">我还没说完，回到对话</button>

    <view class="candidate-paper">
      <view class="paper-heading">
        <text>准备确认的版本</text>
        <text>修改任何一句都没关系</text>
      </view>
      <view
        v-for="field in option.fields"
        :key="field.key"
        class="candidate-paragraph"
      >
        <text class="paragraph-lead">{{ paragraphLead(field.key, field.label) }}</text>
        <textarea
          class="paragraph-input"
          :value="modelValue.fields[field.key]"
          :maxlength="3000"
          :placeholder="field.placeholder"
          :aria-label="paragraphLead(field.key, field.label)"
          @input="updateField(field.key, $event)"
        />
        <text class="paragraph-count">{{ modelValue.fields[field.key]?.length ?? 0 }} / 3000</text>
      </view>
    </view>

    <view v-if="modelValue.uncertainties.length" class="uncertain-note">
      <text class="uncertain-title">还有没替你猜的部分</text>
      <text>你已经选择结束讲述，所以这些问题不会挡住你。若它们很重要，可以回到对话补充。</text>
    </view>

    <text class="privacy-note">批准只锁定上面的文字，不会自动发送邀请，也不会分享完整私人对话。</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { expressionModeOption, type EditableExpression } from "../domain/expression";

const props = defineProps<{
  modelValue: EditableExpression;
  sourceText: string;
}>();

const emit = defineEmits<{
  "update-field": [key: string, value: string];
  "continue-talking": [];
}>();

const option = computed(() => expressionModeOption(props.modelValue.mode));
const safetyLabel = computed(() => ({
  WARN: "继续前请留意",
  BLOCK_SHARE: "暂不建议批准",
  PAUSE: "建议先暂停",
  ALLOW: "",
})[props.modelValue.safetyDisposition]);

function paragraphLead(key: string, fallback: string) {
  return ({
    observation: "我看到的情况",
    feeling: "这让我感到",
    need: "我在意的是",
    request: "我想和你商量",
    claim: "我目前的理解",
    basis: "我依据的信息",
    verificationRequest: "我想一起核实",
    boundary: "我需要守住的边界",
    reason: "我愿意说明",
    acceptableRange: "仍然可以这样沟通",
    selfProtectiveAction: "如果再次发生",
  } as Record<string, string>)[key] ?? fallback;
}

function updateField(key: string, event: Event) {
  emit("update-field", key, (event as unknown as { detail: { value: string } }).detail.value);
}
</script>

<style scoped lang="scss">
.review-screen { padding: 36px 24px 150px; }

.candidate-status {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-seal {
  width: 42px;
  height: 42px;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #315b47;
  color: #fffdf8;
  font-family: Georgia, serif;
  font-size: 11px;
  letter-spacing: .08em;
}

.status-title,
.status-note { display: block; }
.status-title { color: #1c2923; font-size: 13px; font-weight: 800; }
.status-note { margin-top: 4px; color: #be442e; font-size: 11px; font-weight: 800; }

.title {
  display: block;
  margin-top: 24px;
  color: #1c2923;
  font-family: "Songti SC", "STSong", serif;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.35;
}

.description {
  display: block;
  margin-top: 12px;
  color: #68726c;
  font-size: 14px;
  line-height: 1.75;
}

.safety-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 24px;
  padding: 15px 16px;
  border: 1px solid #e1b492;
  border-radius: 12px;
  background: #fff0df;
}

.safety-block_share,
.safety-pause { border-color: #d59c93; background: #f9e5e1; }
.safety-label { color: #a34631; font-size: 12px; font-weight: 800; }
.safety-copy { color: #6c5148; font-size: 12px; line-height: 1.6; }

.source-fold {
  margin-top: 25px;
  padding: 15px 16px;
  border: 1px dashed #c9c5bb;
  border-radius: 11px;
  background: rgba(250, 248, 241, .72);
}

.source-heading {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #315b47;
  font-size: 11px;
  font-weight: 800;
}

.source-heading text:last-child { color: #7e8781; font-weight: 500; }
.source-copy {
  display: block;
  max-height: 150px;
  margin-top: 10px;
  overflow: hidden;
  color: #68726c;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.return-conversation {
  width: 100%;
  min-height: 46px;
  margin-top: 11px;
  border: 1px solid #bfc9c1;
  border-radius: 10px;
  background: rgba(255, 253, 248, .34);
  color: #315b47;
  font-size: 13px;
  font-weight: 700;
}

.candidate-paper {
  margin-top: 28px;
  padding: 22px 18px 8px;
  border: 1px solid #c9c5bb;
  border-top: 6px solid #315b47;
  border-radius: 3px 16px 3px 16px;
  background: #fffdf8;
  box-shadow: 0 16px 38px rgba(42, 51, 44, .08);
}

.paper-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid #e1ddd3;
}

.paper-heading text:first-child {
  color: #1c2923;
  font-family: "Songti SC", "STSong", serif;
  font-size: 18px;
  font-weight: 700;
}

.paper-heading text:last-child { color: #7d847f; font-size: 10px; }

.candidate-paragraph {
  position: relative;
  padding: 18px 0 15px;
  border-bottom: 1px solid #e7e3da;
}

.candidate-paragraph:last-child { border-bottom: 0; }
.paragraph-lead { display: block; color: #be442e; font-size: 11px; font-weight: 800; letter-spacing: .08em; }
.paragraph-input {
  width: 100%;
  min-height: 88px;
  margin-top: 8px;
  padding: 0 0 19px;
  box-sizing: border-box;
  color: #1c2923;
  font-size: 15px;
  line-height: 1.72;
}
.paragraph-count { position: absolute; right: 0; bottom: 9px; color: #999b95; font-size: 9px; }

.uncertain-note {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 18px;
  padding: 14px 15px;
  border-left: 3px solid #b79043;
  background: rgba(238, 223, 189, .38);
  color: #68726c;
  font-size: 12px;
  line-height: 1.6;
}

.uncertain-title { color: #725a27; font-weight: 800; }
.privacy-note { display: block; margin-top: 20px; color: #68726c; font-size: 12px; line-height: 1.65; }
</style>
