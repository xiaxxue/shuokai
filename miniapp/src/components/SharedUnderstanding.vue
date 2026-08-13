<template>
  <view class="understanding-shell">
    <view class="understanding-intro">
      <text class="kicker">理解层 · 双方分别确认</text>
      <text class="headline">先确认是否准确，<br />不是确认谁对谁错。</text>
      <text class="lede">这份共同理解只使用双方已经分享的表达卡。它不会替你认错、原谅，也不会自动进入下一步方案。</text>
    </view>

    <view v-if="displayResult.commonGround.length" class="section section-common">
      <view class="section-heading"><text class="section-number">01</text><text>双方明确的共同点</text></view>
      <view v-for="(item, index) in displayResult.commonGround" :key="`common-${index}`" class="evidence-card">
        <text class="evidence-text">{{ item.text }}</text>
        <view class="source-row"><text v-for="source in item.sources" :key="source" class="source-chip">{{ sourceLabel(source) }}</text></view>
      </view>
    </view>

    <view v-if="displayResult.differences.length" class="section section-difference">
      <view class="section-heading"><text class="section-number">02</text><text>仍然不同的地方</text></view>
      <view v-for="(item, index) in displayResult.differences" :key="`difference-${index}`" class="difference-card">
        <text class="difference-topic">{{ item.topic }}</text>
        <view class="side-grid">
          <view><text class="side-label">发起者的表达</text><text class="side-copy">{{ item.sideA }}</text></view>
          <view><text class="side-label">受邀者的表达</text><text class="side-copy">{{ item.sideB }}</text></view>
        </view>
        <view class="source-row"><text v-for="source in item.sources" :key="source" class="source-chip">{{ sourceLabel(source) }}</text></view>
      </view>
    </view>

    <view v-if="displayResult.unverifiedFacts.length" class="section section-unverified">
      <view class="section-heading"><text class="section-number">03</text><text>尚未核实的事实</text></view>
      <view v-for="(item, index) in displayResult.unverifiedFacts" :key="`fact-${index}`" class="evidence-card compact">
        <text class="evidence-text">{{ item.text }}</text>
        <view class="source-row"><text v-for="source in item.sources" :key="source" class="source-chip">{{ sourceLabel(source) }}</text></view>
      </view>
    </view>

    <view v-if="displayResult.boundaries.length" class="section section-boundary">
      <view class="section-heading"><text class="section-number">04</text><text>已经声明的边界</text></view>
      <view v-for="(item, index) in displayResult.boundaries" :key="`boundary-${index}`" class="evidence-card compact">
        <text class="evidence-text">{{ item.text }}</text>
        <view class="source-row"><text v-for="source in item.sources" :key="source" class="source-chip">{{ sourceLabel(source) }}</text></view>
      </view>
    </view>

    <view class="candidate-card">
      <text class="candidate-label">候选共同理解</text>
      <text class="candidate-copy">{{ displayResult.candidateUnderstanding.text }}</text>
      <view class="source-row"><text v-for="source in displayResult.candidateUnderstanding.sources" :key="source" class="source-chip light">{{ sourceLabel(source) }}</text></view>
      <view class="core-question">
        <text>此刻真正需要一起看见的问题</text>
        <text>{{ displayResult.coreQuestion.text }}</text>
      </view>
    </view>

    <view class="accuracy-panel">
      <text class="accuracy-title">这份内容准确表达了你的意思吗？</text>
      <text class="accuracy-note">“准确”不等于同意对方，也不等于接受下一步方案。</text>
      <view v-if="ownDecision" class="decision-saved">
        <text>{{ ownDecision === "ACCURATE" ? "✓ 已确认准确" : "已标记一处不准确" }}</text>
        <text>{{ accurateCount }} / 2 人确认准确</text>
      </view>
      <template v-else>
        <button class="accurate-button" :disabled="busy" @tap="$emit('decide', 'ACCURATE', '')">准确表达了我的意思</button>
        <button class="inaccurate-toggle" :disabled="busy" @tap="showFeedback = !showFeedback">有一处不准确</button>
        <view v-if="showFeedback" class="feedback-box">
          <textarea v-model="feedback" :maxlength="3000" placeholder="请指出哪一句不准确，以及你原本想表达什么。这里不会直接展示给对方。" />
          <text class="private-note">🔒 这段反馈只用于修正理解，不直接分享。</text>
          <button class="feedback-submit" :disabled="busy || !feedback.trim()" @tap="$emit('decide', 'INACCURATE', feedback.trim())">提交这处问题</button>
        </view>
      </template>
      <view class="exit-actions">
        <button :disabled="busy" @tap="$emit('edit-own')">修改我的表达</button>
        <button :disabled="busy" @tap="$emit('pause')">我想暂停</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  sharedUnderstandingDisplay,
  sourceLabel,
  type SharedUnderstanding,
} from "../domain/understanding";

const props = defineProps<{
  result: SharedUnderstanding;
  ownDecision: "ACCURATE" | "INACCURATE" | null;
  accurateCount: number;
  busy: boolean;
}>();

const displayResult = computed(() => sharedUnderstandingDisplay(props.result));

defineEmits<{
  decide: [decision: "ACCURATE" | "INACCURATE", feedback: string];
  "edit-own": [];
  pause: [];
}>();

const showFeedback = ref(false);
const feedback = ref("");
</script>

<style scoped lang="scss">
.understanding-shell { display: flex; min-width: 0; flex-direction: column; gap: 22px; padding-bottom: 28px; }
.understanding-intro { padding: 12px 2px 4px; }
.kicker { display: block; color: #c94933; font-size: 11px; font-weight: 800; letter-spacing: .18em; }
.headline { display: block; margin-top: 16px; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 32px; font-weight: 700; line-height: 1.22; overflow-wrap: anywhere; }
.lede { display: block; margin-top: 14px; color: #68736f; font-size: 13px; line-height: 1.85; }
.section { padding: 18px; border: 1px solid rgba(34, 52, 45, .1); border-radius: 20px; }
.section-common { background: rgba(219, 232, 216, .52); }
.section-difference { background: rgba(246, 223, 214, .56); }
.section-unverified { background: rgba(239, 230, 209, .58); }
.section-boundary { background: rgba(226, 231, 220, .78); border-left: 4px solid #315a45; }
.section-heading { display: flex; align-items: baseline; gap: 9px; margin-bottom: 13px; color: #183029; font-size: 14px; font-weight: 800; }
.section-number { color: #c94933; font-family: Georgia, serif; font-size: 10px; letter-spacing: .12em; }
.evidence-card + .evidence-card, .difference-card + .difference-card { margin-top: 12px; }
.evidence-card, .difference-card { padding: 14px; border-radius: 14px; background: rgba(255, 253, 248, .72); }
.evidence-card.compact { padding: 12px 14px; }
.evidence-text, .side-copy { display: block; color: #183029; font-size: 14px; line-height: 1.75; }
.difference-topic { display: block; margin-bottom: 11px; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 18px; font-weight: 700; }
.side-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
.side-grid > view { min-width: 0; padding: 10px; border-radius: 11px; background: rgba(255, 255, 255, .54); }
.side-label { display: block; margin-bottom: 6px; color: #68736f; font-size: 9px; font-weight: 700; letter-spacing: .08em; }
.source-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
.source-chip { max-width: 100%; padding: 3px 7px; border: 1px solid rgba(34, 52, 45, .14); border-radius: 999px; color: #68736f; font-size: 8px; overflow-wrap: anywhere; }
.source-chip.light { border-color: rgba(255, 255, 255, .25); color: rgba(255, 255, 255, .72); }
.candidate-card { padding: 22px; border-radius: 22px; background: #315a45; color: #fff; box-shadow: 0 18px 42px rgba(28, 51, 42, .16); }
.candidate-label { display: block; color: rgba(255, 255, 255, .64); font-size: 10px; font-weight: 800; letter-spacing: .16em; }
.candidate-copy { display: block; margin-top: 14px; font-family: "Songti SC", "STSong", serif; font-size: 21px; font-weight: 700; line-height: 1.55; }
.core-question { margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, .2); }
.core-question text { display: block; font-size: 11px; line-height: 1.65; }
.core-question text:last-child { margin-top: 5px; font-size: 15px; font-weight: 700; }
.accuracy-panel { padding: 20px; border: 1px solid rgba(34, 52, 45, .12); border-radius: 20px; background: #fffdf8; }
.accuracy-title { display: block; color: #183029; font-size: 17px; font-weight: 800; }
.accuracy-note { display: block; margin: 8px 0 16px; color: #68736f; font-size: 11px; line-height: 1.65; }
.accurate-button, .feedback-submit { min-height: 48px; border-radius: 14px; background: #e85d3f; color: #fff; font-size: 14px; font-weight: 800; }
.inaccurate-toggle { margin-top: 9px; min-height: 44px; border: 1px solid rgba(34, 52, 45, .15); border-radius: 14px; background: transparent; color: #183029; font-size: 13px; }
.feedback-box { margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(239, 230, 209, .5); }
.feedback-box textarea { width: 100%; height: 118px; color: #183029; font-size: 13px; line-height: 1.65; box-sizing: border-box; }
.private-note { display: block; margin: 7px 0 10px; color: #315a45; font-size: 9px; }
.decision-saved { display: flex; justify-content: space-between; gap: 12px; padding: 13px; border-radius: 13px; background: rgba(219, 232, 216, .65); color: #315a45; font-size: 11px; font-weight: 700; }
.exit-actions { display: flex; gap: 8px; margin-top: 14px; }
.exit-actions button { flex: 1; min-height: 39px; border: 0; background: transparent; color: #68736f; font-size: 11px; text-decoration: underline; }
@media (max-width: 360px) { .headline { font-size: 28px; } }
</style>
