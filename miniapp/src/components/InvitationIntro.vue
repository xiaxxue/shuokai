<template>
  <view class="invitation-intro">
    <template v-if="!clarifying">
      <text class="invitation-eyebrow">一封沟通邀请</text>
      <text class="invitation-title">{{ context.inviterName }}想和你把一件事说开。</text>
      <text class="invitation-lead">先不用回应任何结论。你可以先确认对方想谈什么，以及这里接下来会发生什么。</text>

      <view class="topic-letter">
        <view class="topic-letter-fold" />
        <text class="topic-label">这次想谈的是</text>
        <text class="topic-copy">{{ topicCopy }}</text>
      </view>

      <view class="process-note">
        <text class="process-title">进入以后，你会经历</text>
        <view v-for="(item, index) in processItems" :key="item" class="process-row">
          <text class="process-number">0{{ index + 1 }}</text>
          <text>{{ item }}</text>
        </view>
      </view>

      <view class="privacy-letter">
        <text class="privacy-seal">私</text>
        <view>
          <text class="privacy-title">先在自己的空间里说</text>
          <text class="privacy-copy">原始录音、原话和 AI 追问只有你自己能看到。只有你最后确认的表达卡才会分享。</text>
        </view>
      </view>

      <button class="invitation-primary" :disabled="busy" @tap="$emit('start')">我知道是哪件事，开始表达</button>
      <button class="invitation-link strong" :disabled="busy" @tap="$emit('clarify')">我不确定对方指什么</button>
      <button class="invitation-link" :disabled="busy" @tap="$emit('leave')">暂时不参与，先离开</button>
    </template>

    <template v-else>
      <text class="invitation-eyebrow">先把背景对齐</text>
      <text class="invitation-title">不知道在谈什么，就不用急着开始。</text>
      <text class="invitation-lead">“说开”目前不能替你联系对方，也不会假装消息已经送达。你可以复制下面这段话，发回给邀请你的人。</text>

      <view class="clarification-letter">
        <text class="clarification-label">可以这样问</text>
        <text class="clarification-copy">{{ clarificationMessage }}</text>
      </view>

      <button class="invitation-primary" :disabled="busy" @tap="$emit('copy-request')">复制这段话，发给邀请人</button>
      <button class="invitation-secondary" :disabled="busy" @tap="$emit('start')">我想先说说自己的理解</button>
      <button class="invitation-link strong" :disabled="busy" @tap="$emit('back')">返回查看邀请</button>
      <button class="invitation-link" :disabled="busy" @tap="$emit('leave')">暂时离开</button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { InvitationContext } from "../domain/invitation";

const props = defineProps<{
  context: InvitationContext;
  clarificationMessage: string;
  clarifying: boolean;
  busy: boolean;
}>();

defineEmits<{
  start: [];
  clarify: [];
  leave: [];
  back: [];
  "copy-request": [];
}>();

const topicCopy = computed(() => props.context.topic || "邀请方还没有留下足够清楚的事件说明。你可以先请对方补充背景。 ");
const processItems = [
  "先讲你的版本，不必迎合对方",
  "AI 追问缺少的背景，并整理成表达卡",
  "你确认后才分享，再进入双方共同空间",
];
</script>

<style scoped lang="scss">
$paper: #f3efe6;
$surface: #fffdf8;
$ink: #1c2923;
$muted: #68726c;
$line: #d8d3c8;
$coral: #df5b3f;
$coral-dark: #be442e;
$sage: #dfe9dc;
$green: #315b47;

.invitation-intro {
  position: relative;
  min-height: calc(100vh - 92px);
  min-height: calc(100dvh - 92px);
  padding: 36px 24px 72px;
  box-sizing: border-box;
}

.invitation-eyebrow {
  display: block;
  color: $coral-dark;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 3px;
}

.invitation-title {
  display: block;
  margin: 14px 0 12px;
  font-family: "Songti SC", "STSong", serif;
  font-size: 29px;
  font-weight: 700;
  line-height: 1.38;
}

.invitation-lead {
  display: block;
  color: $muted;
  font-size: 13px;
  line-height: 1.8;
}

.topic-letter {
  position: relative;
  margin-top: 26px;
  padding: 22px 20px 19px 24px;
  overflow: hidden;
  border: 1px solid rgba(190, 68, 46, .22);
  border-radius: 4px 15px 15px 4px;
  background: $surface;
  box-shadow: 0 12px 34px rgba(55, 47, 38, .07);
}

.topic-letter::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  background: $coral;
  content: "";
}

.topic-letter-fold {
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-top: 32px solid rgba(223, 91, 63, .12);
  border-left: 32px solid transparent;
}

.topic-label,
.process-title,
.clarification-label {
  display: block;
  color: $coral-dark;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 2px;
}

.topic-copy {
  display: block;
  margin-top: 11px;
  font-family: "Songti SC", "STSong", serif;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.65;
}

.process-note {
  margin-top: 25px;
  padding: 2px 3px;
}

.process-title { margin-bottom: 8px; color: $green; }

.process-row {
  padding: 11px 0;
  display: flex;
  align-items: baseline;
  gap: 13px;
  border-bottom: 1px solid rgba(104, 114, 108, .13);
  color: $ink;
  font-size: 12px;
  line-height: 1.55;
}

.process-number {
  color: $coral-dark;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  font-weight: 800;
}

.privacy-letter {
  margin: 22px 0 24px;
  padding: 15px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-radius: 12px;
  background: rgba(223, 233, 220, .72);
}

.privacy-seal {
  width: 30px;
  height: 30px;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: $green;
  color: #fff;
  font-family: "Songti SC", "STSong", serif;
  font-size: 12px;
}

.privacy-title,
.privacy-copy { display: block; }
.privacy-title { color: $green; font-size: 11px; font-weight: 800; }
.privacy-copy { margin-top: 4px; color: #557062; font-size: 10px; line-height: 1.65; }

.invitation-primary,
.invitation-secondary {
  width: 100%;
  min-height: 50px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
}

.invitation-primary { background: $coral; box-shadow: 0 7px 18px rgba(223, 91, 63, .18); color: #fff; }
.invitation-secondary { margin-top: 10px; border: 1px solid $line; background: rgba(255, 253, 248, .58); color: $ink; }
.invitation-primary[disabled], .invitation-secondary[disabled], .invitation-link[disabled] { opacity: .4; }

.invitation-link {
  width: 100%;
  min-height: 44px;
  margin-top: 3px;
  background: transparent;
  color: $muted;
  font-size: 11px;
}

.invitation-link.strong { color: $coral-dark; font-weight: 800; }

.clarification-letter {
  margin: 30px 0 24px;
  padding: 22px;
  border: 1px dashed rgba(190, 68, 46, .38);
  border-radius: 14px;
  background: $surface;
}

.clarification-copy {
  display: block;
  margin-top: 13px;
  font-family: "Songti SC", "STSong", serif;
  font-size: 17px;
  line-height: 1.75;
}

@media (min-width: 720px) {
  .invitation-intro { padding-right: 34px; padding-left: 34px; }
}

@media (max-width: 360px) {
  .invitation-intro { padding-right: 18px; padding-left: 18px; }
  .invitation-title { font-size: 27px; }
  .topic-copy { font-size: 18px; }
}
</style>
