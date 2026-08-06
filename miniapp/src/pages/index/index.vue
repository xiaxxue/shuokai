<template>
  <view class="page-shell">
    <view class="topbar">
      <view>
        <text class="brand">说开</text>
        <text class="brand-en">SHUOKAI</text>
      </view>
      <text v-if="stage !== 'WELCOME'" class="progress-copy">{{ currentStep }} / {{ totalSteps }}</text>
      <view class="progress-track">
        <view class="progress-fill" :style="{ width: `${progressPercent}%` }" />
      </view>
    </view>

    <scroll-view
      class="content"
      scroll-y
      :enhanced="true"
      :show-scrollbar="false"
      :scroll-top="contentScrollTop"
      @scroll="contentScrollTop = $event.detail.scrollTop"
    >
      <view v-if="stage === 'WELCOME'" class="screen welcome-screen">
        <text class="eyebrow">当普通聊天失效</text>
        <view class="hero-title">
          换一个空间，
          <text class="hero-break">把话<text class="accent">说开</text>。</text>
        </view>
        <text class="lead">AI 不替你判断谁对谁错。它只帮助两个人慢下来，把事实、理解、感受和请求分开。</text>
        <button class="primary full" :loading="busy" @tap="createRoom">发起一次沟通</button>
        <view class="join-box">
          <input
            v-model="joinCode"
            class="code-input"
            :maxlength="7"
            placeholder="输入 7 位房间码"
            @input="normalizeJoinCode"
          />
          <button class="secondary" @tap="joinRoom">加入</button>
        </view>
        <view class="trust">
          <text class="trust-item">私人草稿默认仅自己可见</text>
          <text class="trust-item">确认后才进入共同空间</text>
        </view>
      </view>

      <view v-else-if="stage === 'GOAL'" class="screen">
        <text class="eyebrow">先确认意图</text>
        <text class="title">这次，你最希望发生什么？</text>
        <text class="description">先选一个方向。它会成为 AI 引导你表达时的边界。</text>
        <view class="option-list">
          <button
            v-for="item in goals"
            :key="item"
            class="option"
            :class="{ selected: goal === item }"
            @tap="goal = item"
          >
            <text class="radio" />
            <text>{{ item }}</text>
          </button>
        </view>
      </view>

      <view v-else-if="stage === 'RECORD'" class="screen">
        <text class="eyebrow">只说你的版本</text>
        <text class="title">先把事情说出来。</text>
        <text class="description">不用组织得很完美。录音结束后会转成文字，你仍然可以删改。</text>
        <button
          class="record-button"
          :class="{ recording }"
          :disabled="busy"
          @tap="toggleRecording"
        >
          <text class="mic">{{ recording ? "■" : "●" }}</text>
          <text>{{ recording ? "正在录音，再点一次结束" : "按下开始说" }}</text>
        </button>
        <textarea
          v-model="transcript"
          class="transcript"
          :maxlength="12000"
          placeholder="也可以直接打字。这里的内容现在只有你能看到。"
        />
      </view>

      <view v-else-if="stage === 'CLARIFY'" class="screen">
        <text class="eyebrow">先抓住最重要的一点</text>
        <text class="title">如果对方只能准确理解一件事，你最希望是哪一件？</text>
        <view class="ai-card">
          <text>可以写下最让你在意的影响，也可以说明怎样的回应会让你觉得自己被听见。</text>
        </view>
        <textarea
          v-model="clarification"
          class="transcript large"
          :maxlength="3000"
          placeholder="用你自己的话回答……"
        />
      </view>

      <view v-else-if="stage === 'REVIEW'" class="screen">
        <text class="eyebrow">发送前由你确认</text>
        <text class="title">把你的表达整理成四部分</text>
        <text class="description">系统先带入你的原话，请补全并逐项确认。只有这四张卡会分享给对方。</text>
        <view class="card-list">
          <view
            v-for="(key, index) in perspectiveKeys"
            :key="key"
            class="perspective-card"
            :class="`tone-${index}`"
          >
            <text class="card-label">{{ perspectiveLabels[index] }}</text>
            <textarea v-model="perspective[key]" :maxlength="1000" />
          </view>
        </view>
      </view>

      <view v-else-if="stage === 'INVITE'" class="screen invite-screen">
        <text class="eyebrow">你的部分已经保存</text>
        <text class="title">现在，邀请对方讲自己的版本。</text>
        <view class="room-card">
          <text>沟通房间码</text>
          <text class="room-code">{{ room?.code }}</text>
          <text>对方看不到你的原始录音和草稿</text>
        </view>
        <!-- #ifdef MP-WEIXIN -->
        <button class="primary full" open-type="share">微信邀请对方</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button class="primary full" @tap="shareInvite">分享邀请链接</button>
        <!-- #endif -->
        <button class="secondary refresh" :loading="busy" @tap="refreshRoom">刷新沟通进展</button>
        <text class="waiting">对方确认自己的版本后，这里会进入双方共同查看的页面。</text>
      </view>

      <view v-else-if="stage === 'COMMON'" class="screen">
        <text class="eyebrow">看懂彼此</text>
        <text class="title">理解，不必同意。</text>
        <text class="description">这里只使用双方本人确认过的内容，不包含原始录音和私人草稿。</text>
        <view
          v-for="item in snapshot?.approvedPerspectives ?? []"
          :key="item.role"
          class="shared-perspective"
        >
          <text class="card-label">{{ item.role === "A" ? "发起者确认的意思" : "受邀者确认的意思" }}</text>
          <text>{{ item.fact }}</text>
          <text>{{ item.meaning }}</text>
          <text>{{ item.impact }}</text>
          <text>{{ item.request }}</text>
        </view>
        <view v-if="snapshot?.sharedView" class="shared-view">
          <text class="card-label">共同点</text>
          <text>{{ snapshot.sharedView.common_ground }}</text>
          <text class="card-label section-label">仍然不同的地方</text>
          <text>{{ snapshot.sharedView.disagreement }}</text>
          <text class="card-label section-label">接下来最值得回答的问题</text>
          <text>{{ snapshot.sharedView.core_question }}</text>
        </view>
      </view>
    </scroll-view>

    <view
      v-if="stage !== 'WELCOME' && stage !== 'INVITE' && stage !== 'COMMON'"
      class="bottom-bar"
    >
      <button v-if="canNavigateBack(stage)" class="back" @tap="goBack">返回修改</button>
      <view v-else class="back-placeholder" />
      <button
        class="primary next"
        :disabled="!canContinue || busy"
        :loading="busy"
        @tap="next"
      >继续</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import type { ClientStage } from "../../domain/room-state";
import {
  canNavigateBack,
  clientStageOrder,
  previousStage,
  stageForRoom,
} from "../../domain/room-state";
import { perspectiveFromDraft } from "../../domain/perspective";
import type { Perspective, RoomSession, RoomSnapshot } from "../../domain/types";
import { loginForPlatform, roomApi, transcribeAudio } from "../../services/api";
import { startRecording, stopRecording } from "../../services/recorder";

const goals = [
  "让我被准确理解",
  "理解对方为什么这样想",
  "找到一个双方都能尝试的下一步",
];
const perspectiveKeys: Array<keyof Perspective> = ["fact", "meaning", "impact", "request"];
const perspectiveLabels = ["可观察事实", "我的理解", "对我的影响", "我的请求"];

const stage = ref<ClientStage>("WELCOME");
const room = ref<RoomSession | null>(null);
const snapshot = ref<RoomSnapshot | null>(null);
const goal = ref(goals[0]);
const joinCode = ref("");
const contentScrollTop = ref(0);
const recording = ref(false);
const busy = ref(false);
const transcript = ref("");
const clarification = ref("");
const perspective = reactive<Perspective>({ fact: "", meaning: "", impact: "", request: "" });

watch(stage, () => {
  contentScrollTop.value = 0;
}, { flush: "post" });

const totalSteps = clientStageOrder.length - 1;
const currentStep = computed(() => {
  const step = Math.max(0, clientStageOrder.indexOf(stage.value) - 1);
  return Math.min(step + 1, totalSteps);
});
const progressPercent = computed(() => (currentStep.value / totalSteps) * 100);
const canContinue = computed(() => {
  if (stage.value === "RECORD") return transcript.value.trim().length > 0;
  if (stage.value === "CLARIFY") return clarification.value.trim().length > 0;
  if (stage.value === "REVIEW") {
    return Object.values(perspective).every((value) => value.trim().length > 0);
  }
  return true;
});

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toast(title: string) {
  uni.showToast({ title, icon: "none" });
}

onLoad((options) => {
  const incomingRoom = typeof options?.room === "string" ? options.room : "";
  if (incomingRoom) joinCode.value = incomingRoom.slice(0, 7).toUpperCase();
});

onShareAppMessage(() => ({
  title: "我想和你把这件事说开",
  path: `/pages/index/index?room=${room.value?.code ?? ""}`,
}));

function normalizeJoinCode(event: Event) {
  const value = (event as unknown as { detail: { value: string } }).detail.value;
  joinCode.value = value.toUpperCase();
}

async function createRoom() {
  busy.value = true;
  try {
    await loginForPlatform();
    const created = await roomApi.create();
    room.value = created;
    stage.value = stageForRoom(created.role, created.state);
  } catch (error) {
    toast(message(error, "创建失败"));
  } finally {
    busy.value = false;
  }
}

async function joinRoom() {
  if (joinCode.value.trim().length !== 7) {
    toast("请输入 7 位房间码");
    return;
  }
  busy.value = true;
  try {
    const joined = await roomApi.join(joinCode.value.trim().toUpperCase());
    room.value = joined;
    const joinedStage = stageForRoom(joined.role, joined.state);
    if (joinedStage === "COMMON") snapshot.value = await roomApi.snapshot(joined.roomId);
    stage.value = joinedStage;
  } catch (error) {
    toast(message(error, "加入失败"));
  } finally {
    busy.value = false;
  }
}

async function toggleRecording() {
  try {
    if (!recording.value) {
      const { completion } = await startRecording();
      recording.value = true;
      void completion
        .then(async (audio) => {
          recording.value = false;
          busy.value = true;
          transcript.value = await transcribeAudio(audio);
        })
        .catch((error) => {
          recording.value = false;
          toast(message(error, "录音失败"));
        })
        .finally(() => {
          busy.value = false;
        });
      return;
    }
    busy.value = true;
    stopRecording();
  } catch (error) {
    recording.value = false;
    toast(message(error, "录音失败"));
  } finally {
    busy.value = false;
  }
}

async function next() {
  if (!room.value) return;
  busy.value = true;
  try {
    if (stage.value === "GOAL") {
      await roomApi.setGoal(room.value.roomId, goal.value);
      stage.value = "RECORD";
    } else if (stage.value === "RECORD") {
      stage.value = "CLARIFY";
    } else if (stage.value === "CLARIFY") {
      await roomApi.saveDraft(room.value.roomId, transcript.value, clarification.value);
      Object.assign(perspective, perspectiveFromDraft(transcript.value, clarification.value));
      stage.value = "REVIEW";
    } else if (stage.value === "REVIEW") {
      const approved = await roomApi.approvePerspective(room.value.roomId, perspective);
      room.value = { ...room.value, state: approved.state };
      if (stageForRoom(room.value.role, approved.state) === "COMMON") {
        snapshot.value = await roomApi.snapshot(room.value.roomId);
        stage.value = "COMMON";
      } else {
        stage.value = "INVITE";
      }
    }
  } catch (error) {
    toast(message(error, "请稍后重试"));
  } finally {
    busy.value = false;
  }
}

async function refreshRoom() {
  if (!room.value) return;
  busy.value = true;
  try {
    const latest = await roomApi.snapshot(room.value.roomId);
    snapshot.value = latest;
    room.value = { ...room.value, state: latest.room.state };
    const nextStage = stageForRoom(room.value.role, latest.room.state);
    if (nextStage === "COMMON") stage.value = nextStage;
    else toast("还在等待对方确认");
  } catch (error) {
    toast(message(error, "刷新失败"));
  } finally {
    busy.value = false;
  }
}

async function shareInvite() {
  if (!room.value) return;
  const fallback = `沟通房间码：${room.value.code}`;
  const shareUrl = typeof location === "undefined"
    ? fallback
    : `${location.origin}${location.pathname}?room=${room.value.code}`;
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: "我想和你把这件事说开", text: fallback, url: shareUrl });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  uni.setClipboardData({ data: shareUrl });
}

function goBack() {
  stage.value = previousStage(stage.value);
}
</script>

<style lang="scss" src="./index.scss"></style>
