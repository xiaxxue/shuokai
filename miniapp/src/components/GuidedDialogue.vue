<template>
  <view class="dialogue-shell">
    <view class="dialogue-intro">
      <view class="intro-line"><text class="eyebrow">理解循环 · 第 {{ state.round }} 轮</text><text class="live-mark">{{ readOnly ? "历史记录" : "持续更新" }}</text></view>
      <text class="title">{{ readOnly ? "这次沟通，留下了这些来回。" : "先确认听懂，再说自己的回应。" }}</text>
      <text class="lede">{{ readOnly ? "按发生顺序回看双方已经留下的表达、复述、确认与回应。这里是只读记录，不会重新开启房间。" : "这里不是一次性总结。每轮都要经过“表达—复述—确认—回应”，任何一方都可以纠正、继续或暂停。" }}</text>
      <button v-if="readOnly" class="history-back" @tap="$emit('close-history')">← 返回本次结果</button>
    </view>

    <view v-if="!readOnly" class="now-card" :class="{ waiting: !state.canAct }">
      <text class="now-label">此刻轮到</text>
      <text class="now-title">{{ state.canAct ? "你" : roleName(state.activeRole) }}</text>
      <text class="now-copy">{{ actionCopy }}</text>
      <button v-if="!state.canAct" class="refresh" :disabled="busy" @tap="$emit('refresh')">刷新对方进展</button>
    </view>

    <view class="timeline">
      <view v-for="turn in state.turns" :key="turn.id" class="turn" :class="[`kind-${turn.kind.toLowerCase()}`, { mine: turn.authorRole === state.ownRole }]">
        <view class="rail"><text class="rail-dot">{{ turn.kind === 'AI_SUMMARY' ? 'AI' : turn.sequence }}</text><text class="rail-line" /></view>
        <view class="turn-card">
          <view class="turn-meta">
            <text>{{ turnLabel(turn) }}</text>
            <text>第 {{ turn.round }} 轮</text>
          </view>
          <text class="turn-copy">{{ dialogueTurnText(turn) }}</text>
          <view v-if="turn.id === state.focusTurnId" class="focus-flag">正在回应这一段</view>
        </view>
      </view>
    </view>

    <view v-if="!readOnly && state.canAct" class="composer-panel">
      <template v-if="state.step === 'AWAITING_CONFIRMATION'">
        <text class="composer-title">对方准确听懂了吗？</text>
        <text class="composer-help">确认准确不代表同意，只代表“你听到的是我的意思”。</text>
        <button class="primary" :disabled="busy" @tap="$emit('confirm', 'ACCURATE', '')">是的，他听懂了</button>
        <textarea v-model="correction" class="composer-input compact" :maxlength="1200" placeholder="哪里遗漏或理解偏了？只补充最关键的一点。" />
        <button class="secondary" :disabled="busy || !correction.trim()" @tap="submitCorrection">还没有，请他再听一次</button>
      </template>
      <template v-else>
        <text class="composer-title">{{ state.step === 'AWAITING_REFLECTION' ? '把你听懂的说回来' : '现在，说你的回应' }}</text>
        <text class="composer-help">{{ state.step === 'AWAITING_REFLECTION' ? '先不解释自己。可以从“我听见你……”开始。' : '回应对方，也可以继续补充自己的感受、需要或请求。' }}</text>
        <textarea v-model="draft" class="composer-input" :maxlength="3000" :placeholder="placeholder" />
        <button class="primary" :disabled="busy || !draft.trim()" @tap="submitText">{{ state.step === 'AWAITING_REFLECTION' ? '请对方确认我是否听懂' : '发送回应，进入下一轮' }}</button>
      </template>
      <button v-if="hasCompletedRound" class="secondary" :disabled="busy" @tap="$emit('summarize')">先整理我们目前谈到哪</button>
      <button class="pause" :disabled="busy" @tap="$emit('pause')">先暂停这次沟通</button>
    </view>
    <view v-else-if="!readOnly && hasCompletedRound" class="round-actions">
      <text>这一轮已经留下完整记录。你们可以继续，也可以先整理阶段性共同理解。</text>
      <button class="secondary" :disabled="busy" @tap="$emit('summarize')">整理我们目前谈到哪</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  dialogueActionCopy,
  dialogueTurnText,
  type DialogueState,
  type DialogueTurn,
} from "../domain/dialogue";

const props = defineProps<{ state: DialogueState; busy: boolean; readOnly?: boolean }>();
const draft = ref("");
const correction = ref("");
const actionCopy = computed(() => dialogueActionCopy(props.state));
const hasCompletedRound = computed(() => props.state.turns.some((turn) => turn.kind === "RESPONSE"));
const placeholder = computed(() => props.state.step === "AWAITING_REFLECTION"
  ? "例如：我听见你在这件事里感到……你看重的是……你希望我……"
  : "例如：听见你这样说，我想补充的是……我的感受和需要是……");

const emit = defineEmits<{
  submit: [kind: "REFLECTION" | "RESPONSE", text: string];
  confirm: [decision: "ACCURATE" | "NEEDS_CORRECTION", feedback: string];
  refresh: [];
  pause: [];
  summarize: [];
  "close-history": [];
}>();

watch(() => props.state.revision, () => { draft.value = ""; correction.value = ""; });
function roleName(role: "A" | "B") { return role === "A" ? "发起者" : "受邀者"; }
function turnLabel(turn: DialogueTurn) {
  if (turn.kind === "AI_SUMMARY") return "AI 阶段小结";
  const who = turn.authorRole === props.state.ownRole ? "我" : roleName(turn.authorRole ?? "A");
  return `${who} · ${{ OPENING: "表达卡", REFLECTION: "理解复述", REFLECTION_CONFIRMATION: "确认理解", RESPONSE: "回应" }[turn.kind] ?? "记录"}`;
}
function submitText() {
  const text = draft.value.trim();
  if (!text) return;
  emit("submit", props.state.step === "AWAITING_REFLECTION" ? "REFLECTION" : "RESPONSE", text);
}
function submitCorrection() {
  const feedback = correction.value.trim();
  if (feedback) emit("confirm", "NEEDS_CORRECTION", feedback);
}
</script>

<style scoped lang="scss">
.dialogue-shell { padding: 50rpx 42rpx 220rpx; color: #183029; }
.intro-line, .turn-meta { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.eyebrow { color: #c34833; font-size: 22rpx; font-weight: 800; letter-spacing: .13em; }
.live-mark { padding: 7rpx 13rpx; border: 1rpx solid #bdcbbf; border-radius: 99rpx; color: #4b6c5d; font-size: 18rpx; }
.history-back { margin: 20rpx 0 0; padding: 0; background: transparent; color: #ad4431; font-size: 21rpx; text-align: left; }
.history-back::after { border: 0; }
.title { display: block; margin-top: 24rpx; font-family: "Songti SC", "STSong", serif; font-size: 54rpx; font-weight: 700; line-height: 1.25; }
.lede { display: block; margin-top: 16rpx; color: #6a7570; font-size: 25rpx; line-height: 1.75; }
.now-card { margin-top: 34rpx; padding: 25rpx 27rpx; border-radius: 24rpx; background: #315b49; color: #fffaf2; box-shadow: 0 18rpx 44rpx rgba(35,72,56,.15); }
.now-card.waiting { background: #e3eae3; color: #315b49; box-shadow: none; }
.now-label, .now-title, .now-copy { display: block; }
.now-label { opacity: .7; font-size: 19rpx; letter-spacing: .12em; }
.now-title { margin-top: 6rpx; font-family: "Songti SC", "STSong", serif; font-size: 36rpx; font-weight: 700; }
.now-copy { margin-top: 7rpx; font-size: 23rpx; line-height: 1.55; }
.refresh { margin: 17rpx 0 0; padding: 0; background: transparent; color: #ad4431; font-size: 22rpx; text-align: left; }
.refresh::after, .pause::after { border: 0; }
.timeline { margin-top: 42rpx; }
.turn { display: grid; grid-template-columns: 50rpx minmax(0,1fr); gap: 14rpx; }
.rail { display: flex; align-items: center; flex-direction: column; }
.rail-dot { display: flex; align-items: center; justify-content: center; width: 38rpx; height: 38rpx; border: 2rpx solid #d5cfc2; border-radius: 50%; background: #f4f0e7; color: #a44331; font-family: Georgia, serif; font-size: 15rpx; }
.rail-line { width: 1rpx; min-height: 44rpx; flex: 1; background: #d8d2c7; }
.turn:last-child .rail-line { background: transparent; }
.turn-card { position: relative; margin-bottom: 22rpx; padding: 22rpx 23rpx; border: 1rpx solid #d9d3c7; border-radius: 7rpx 23rpx 23rpx; background: rgba(255,253,248,.84); }
.turn.mine .turn-card { background: #e3ece5; border-color: #cbd9ce; }
.kind-ai_summary .turn-card { background: #315b49; color: #fffaf2; }
.turn-meta { color: #79827e; font-size: 18rpx; font-weight: 700; }
.kind-ai_summary .turn-meta { color: #bcd0c4; }
.turn-copy { display: block; margin-top: 12rpx; font-size: 25rpx; line-height: 1.72; white-space: pre-wrap; }
.focus-flag { display: inline-block; margin-top: 14rpx; padding: 6rpx 11rpx; border-radius: 99rpx; background: #f8ded7; color: #ab422f; font-size: 17rpx; }
.composer-panel { position: sticky; bottom: 0; z-index: 3; margin: 16rpx -18rpx -180rpx; padding: 25rpx 23rpx calc(24rpx + env(safe-area-inset-bottom)); border: 1rpx solid #d9d2c6; border-radius: 27rpx 27rpx 0 0; background: rgba(250,247,240,.97); box-shadow: 0 -18rpx 50rpx rgba(39,50,43,.11); }
.composer-title, .composer-help { display: block; }
.composer-title { font-family: "Songti SC", "STSong", serif; font-size: 32rpx; font-weight: 700; }
.composer-help { margin-top: 7rpx; color: #737d78; font-size: 20rpx; line-height: 1.55; }
.composer-input { box-sizing: border-box; width: 100%; min-height: 180rpx; margin-top: 17rpx; padding: 20rpx; border: 1rpx solid #ccc6ba; border-radius: 20rpx; background: #fffdf8; font-size: 25rpx; line-height: 1.6; }
.composer-input.compact { min-height: 130rpx; }
.primary, .secondary { min-height: 92rpx; margin-top: 16rpx; border-radius: 20rpx; font-size: 25rpx; font-weight: 800; }
.primary { background: #df593f; color: #fff; }
.secondary { background: #fffaf3; color: #a94431; border: 1rpx solid #dfb5aa; }
.primary::after, .secondary::after { border: 0; }
.pause { margin: 13rpx auto 0; background: transparent; color: #7a817d; font-size: 21rpx; }
.round-actions { margin-top: 28rpx; padding: 22rpx; border: 1rpx dashed #c9c2b5; border-radius: 20rpx; color: #68756e; font-size: 21rpx; line-height: 1.6; }
@media (max-width: 380px) { .dialogue-shell { padding-right: 30rpx; padding-left: 30rpx; } .title { font-size: 48rpx; } }
</style>
