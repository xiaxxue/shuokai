<template>
  <view class="understanding-shell">
    <view class="understanding-intro">
      <text class="kicker">理解层 · 双方分别确认</text>
      <text class="headline">{{ isMutualVersion ? "先看见彼此真正听懂了什么。" : "先确认是否准确，不是确认谁对谁错。" }}</text>
      <text class="lede">{{ isMutualVersion ? "这里不再重复两张原话卡。只有经过“复述—由原表达者确认准确”的内容，才会进入互相理解。" : "这份共同理解只使用双方已经分享并确认过的表达与多轮沟通。它不会替你认错、原谅，也不会自动进入下一步方案。" }}</text>
    </view>

    <view v-if="mutualItems.length" class="mutual-section">
      <view class="section-heading"><text class="section-number">01</text><text>已经互相听懂的部分</text></view>
      <view v-for="item in mutualItems" :key="item.listenerRole" class="mutual-card">
        <view class="mutual-topline">
          <text class="listener-mark">{{ item.listenerRole }}</text>
          <text>{{ roleLabel(item.listenerRole) }}已经听懂{{ roleLabel(item.speakerRole) }}</text>
          <text class="confirmed-mark">本人确认</text>
        </view>
        <text class="mutual-copy">{{ item.text }}</text>
        <view class="source-row"><text v-for="source in item.sources" :key="source" class="source-chip">{{ sourceLabel(source) }}</text></view>
      </view>
    </view>

    <view v-if="commonGround.length" class="section section-common">
      <view class="section-heading"><text class="section-number">01</text><text>双方明确的共同点</text></view>
      <view v-for="(item, index) in commonGround" :key="`common-${index}`" class="evidence-card">
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

    <view class="candidate-card" :class="{ mutual: isMutualVersion }">
      <text class="candidate-label">{{ isMutualVersion ? "交流后新增的理解" : "候选共同理解" }}</text>
      <text class="candidate-copy">{{ centerpiece.text }}</text>
      <view class="source-row"><text v-for="source in centerpiece.sources" :key="source" class="source-chip light">{{ sourceLabel(source) }}</text></view>
      <view class="core-question">
        <text>{{ isMutualVersion ? "下一轮只需要说清这一件事" : "此刻真正需要一起看见的问题" }}</text>
        <text>{{ nextQuestion.text }}</text>
      </view>
    </view>

    <view class="accuracy-panel">
      <text class="accuracy-title">这份内容准确表达了你的意思吗？</text>
      <text class="accuracy-note">“准确”不等于同意对方，也不等于接受下一步方案。</text>
      <view v-if="ownDecision" class="decision-saved">
        <text>{{ ownDecision === "ACCURATE" ? "✓ 已确认准确" : "已标记一处不准确" }}</text>
        <text>{{ accurateCount }} / 2 人确认准确</text>
      </view>
      <view v-if="showRoomReminder" class="room-reminder">
        <view class="room-reminder-copy">
          <text class="room-reminder-kicker">还差对方确认</text>
          <text class="room-reminder-note">原来的房间仍然有效。把链接再发给对方，对方打开后可凭房间码进入这次沟通。</text>
        </view>
        <view class="room-reminder-code">
          <text>房间码</text>
          <text>{{ roomCode }}</text>
        </view>
        <!-- #ifdef MP-WEIXIN -->
        <button class="room-reminder-button" open-type="share" :disabled="busy">转发给对方确认</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button class="room-reminder-button" :disabled="busy" @tap="$emit('share-room')">再次发送房间链接</button>
        <!-- #endif -->
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
  shouldShowRoomReminder,
  sourceLabel,
  type SharedUnderstanding,
  type EvidenceItem,
} from "../domain/understanding";

const props = defineProps<{
  result: SharedUnderstanding;
  ownDecision: "ACCURATE" | "INACCURATE" | null;
  accurateCount: number;
  roomCode: string;
  busy: boolean;
}>();

const displayResult = computed(() => sharedUnderstandingDisplay(props.result));
const isMutualVersion = computed(() => displayResult.value.schemaVersion === 2);
const mutualItems = computed(() => displayResult.value.schemaVersion === 2
  ? displayResult.value.mutualUnderstanding
  : []);
const commonGround = computed(() => displayResult.value.schemaVersion === 1
  ? displayResult.value.commonGround
  : []);
const centerpiece = computed<EvidenceItem>(() => displayResult.value.schemaVersion === 2
  ? displayResult.value.newUnderstanding
  : displayResult.value.candidateUnderstanding);
const nextQuestion = computed<EvidenceItem>(() => displayResult.value.schemaVersion === 2
  ? displayResult.value.nextQuestion
  : displayResult.value.coreQuestion);
const showRoomReminder = computed(() => shouldShowRoomReminder(props.ownDecision, props.accurateCount));
const roleLabel = (role: "A" | "B") => role === "A" ? "发起者" : "受邀者";

defineEmits<{
  decide: [decision: "ACCURATE" | "INACCURATE", feedback: string];
  "edit-own": [];
  "share-room": [];
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
.mutual-section { padding: 18px; border: 1px solid rgba(49, 90, 69, .13); border-radius: 22px; background: linear-gradient(145deg, rgba(226, 237, 225, .84), rgba(247, 242, 230, .72)); }
.mutual-card + .mutual-card { margin-top: 12px; }
.mutual-card { padding: 16px; border-radius: 16px; background: rgba(255, 253, 248, .88); box-shadow: 0 10px 28px rgba(36, 66, 52, .07); }
.mutual-topline { display: flex; align-items: center; gap: 8px; color: #315a45; font-size: 10px; font-weight: 800; }
.listener-mark { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: #315a45; color: #fffdf8; font-family: Georgia, serif; }
.confirmed-mark { margin-left: auto; padding: 3px 7px; border-radius: 999px; background: #e4eee1; color: #315a45; font-size: 8px; }
.mutual-copy { display: block; margin-top: 12px; color: #183029; font-family: "Songti SC", "STSong", serif; font-size: 18px; font-weight: 700; line-height: 1.65; }
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
.candidate-card.mutual { background: linear-gradient(145deg, #274f3e, #386d54); }
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
.room-reminder { margin-top: 12px; padding: 15px; border: 1px solid rgba(49, 90, 69, .16); border-radius: 16px; background: linear-gradient(145deg, rgba(231, 238, 226, .92), rgba(255, 253, 248, .96)); }
.room-reminder-copy { min-width: 0; }
.room-reminder-kicker { display: block; color: #315a45; font-size: 13px; font-weight: 800; }
.room-reminder-note { display: block; margin-top: 5px; color: #68736f; font-size: 10px; line-height: 1.65; }
.room-reminder-code { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 13px 0 10px; padding-top: 11px; border-top: 1px solid rgba(49, 90, 69, .12); color: #68736f; font-size: 9px; letter-spacing: .08em; }
.room-reminder-code text:last-child { color: #183029; font-family: Georgia, serif; font-size: 15px; font-weight: 700; letter-spacing: .14em; }
.room-reminder-button { min-height: 44px; border: 0; border-radius: 13px; background: #315a45; color: #fffdf8; font-size: 12px; font-weight: 800; }
.room-reminder-button::after { border: 0; }
.exit-actions { display: flex; gap: 8px; margin-top: 14px; }
.exit-actions button { flex: 1; min-height: 39px; border: 0; background: transparent; color: #68736f; font-size: 11px; text-decoration: underline; }
@media (max-width: 360px) { .headline { font-size: 28px; } }
</style>
