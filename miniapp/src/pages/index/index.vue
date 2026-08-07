<template>
  <view class="page-shell" :class="`stage-${stage.toLowerCase()}`">
    <view class="topbar">
      <view class="brand-lockup">
        <text class="brand">说开</text>
        <text class="brand-en">SHUOKAI</text>
      </view>
      <view v-if="stage !== 'WELCOME'" class="progress-meta">
        <text class="progress-label">{{ currentPhaseLabel }}</text>
        <text class="progress-copy">{{ currentStep }} / {{ totalSteps }}</text>
      </view>
      <view v-if="stage !== 'WELCOME'" class="progress-track">
        <view class="progress-fill" :style="{ width: `${progressPercent}%` }" />
      </view>
    </view>

    <view
      v-if="notice"
      class="notice"
      :class="`notice-${notice.kind}`"
      role="status"
      @tap="notice = null"
    >
      <text class="notice-mark">{{ notice.kind === "error" ? "!" : notice.kind === "success" ? "✓" : "·" }}</text>
      <text class="notice-copy">{{ notice.message }}</text>
      <text class="notice-close">×</text>
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
        <view class="welcome-orbit orbit-one" />
        <view class="welcome-orbit orbit-two" />
        <view class="welcome-copy">
          <text class="eyebrow">当普通聊天失效</text>
          <view class="hero-title">
            换一个空间，
            <text class="hero-break">把话<text class="accent">说开</text>。</text>
          </view>
          <text class="lead">不裁判谁对谁错。先把事实、理解、影响和请求分开，再一起看清真正的分歧。</text>
        </view>

        <view class="entry-panel">
          <button class="primary full" :loading="busy" :disabled="busy" @tap="createRoom">
            发起一次沟通
          </button>
          <view class="entry-divider"><text>或用房间码加入</text></view>
          <view class="join-box">
            <input
              v-model="joinCode"
              class="code-input"
              :maxlength="7"
              confirm-type="go"
              placeholder="例如 SAY2026"
              @input="normalizeJoinCode"
              @confirm="joinRoom"
            />
            <button class="secondary join-button" :disabled="busy || joinCode.length !== 7" @tap="joinRoom">
              加入
            </button>
          </view>
        </view>

        <view class="trust">
          <view class="trust-item"><text class="trust-icon">✓</text><text>原始录音和私人草稿仅自己可见</text></view>
          <view class="trust-item"><text class="trust-icon">✓</text><text>只有本人确认的内容才进入共同空间</text></view>
        </view>
      </view>

      <view v-else-if="stage === 'GOAL'" class="screen">
        <text class="eyebrow">先确认意图</text>
        <text class="title">这次，你最希望发生什么？</text>
        <text class="description">先选一个方向。它会成为整理表达时的边界，不代表你必须达成某种结果。</text>
        <view class="option-list">
          <button
            v-for="item in goals"
            :key="item.title"
            class="option"
            :class="{ selected: goal === item.title }"
            @tap="goal = item.title"
          >
            <text class="radio" />
            <view class="option-copy">
              <text class="option-title">{{ item.title }}</text>
              <text class="option-description">{{ item.description }}</text>
            </view>
          </button>
        </view>
      </view>

      <view v-else-if="stage === 'RECORD'" class="screen record-screen">
        <text class="eyebrow">只说你的版本</text>
        <text class="title">先把事情说出来。</text>
        <text class="description">不用组织得很完美。录音结束后会转成文字，你仍然可以删改。</text>
        <button
          class="record-button"
          :class="{ recording }"
          :disabled="busy && !recording"
          @tap="toggleRecording"
        >
          <view class="record-core"><text class="mic">{{ recording ? "■" : "●" }}</text></view>
          <text class="record-label">{{ recording ? "正在录音，点按结束" : "点按开始说" }}</text>
          <text class="record-time">{{ formatDuration(recordingSeconds) }} / 02:00</text>
        </button>
        <view v-if="busy && !recording" class="processing-row">
          <text class="processing-dot" />
          <text>正在把录音转成文字，请稍候…</text>
        </view>
        <view class="field-heading">
          <text>你的原话</text>
          <text>{{ transcript.length }} / 12000</text>
        </view>
        <textarea
          v-model="transcript"
          class="transcript"
          :maxlength="12000"
          placeholder="也可以直接打字。试着描述具体发生了什么，以及它为什么让你在意。"
        />
        <text class="privacy-note">🔒 当前内容已保存在此设备的私人草稿中</text>
      </view>

      <view v-else-if="stage === 'CLARIFY'" class="screen">
        <text class="eyebrow">先抓住最重要的一点</text>
        <text class="title">如果对方只能准确理解一件事，你最希望是哪一件？</text>
        <view class="ai-card">
          <text class="ai-label">整理提示</text>
          <text>可以写下最让你在意的影响，也可以说明怎样的回应会让你觉得自己被听见。</text>
        </view>
        <view class="field-heading">
          <text>你的回答</text>
          <text>{{ clarification.length }} / 3000</text>
        </view>
        <textarea
          v-model="clarification"
          class="transcript large"
          :maxlength="3000"
          placeholder="用你自己的话回答……"
        />
      </view>

      <view v-else-if="stage === 'REVIEW'" class="screen review-screen">
        <text class="eyebrow">发送前由你确认</text>
        <text class="title">把你的表达整理成四部分</text>
        <text class="description">请逐项检查和补全。只有以下四张卡会分享给对方，系统不会发送你的原始录音。</text>
        <view class="card-list">
          <view
            v-for="(key, index) in perspectiveKeys"
            :key="key"
            class="perspective-card"
            :class="`tone-${index}`"
          >
            <view class="card-heading">
              <text class="card-number">0{{ index + 1 }}</text>
              <text class="card-label">{{ perspectiveLabels[index] }}</text>
            </view>
            <textarea v-model="perspective[key]" :maxlength="1000" :placeholder="perspectivePlaceholders[index]" />
            <text class="card-count">{{ perspective[key].length }} / 1000</text>
          </view>
        </view>
        <view class="approval-note"><text>✓</text><text>点击继续即表示你确认：这些内容准确代表你的意思。</text></view>
      </view>

      <view v-else-if="stage === 'INVITE'" class="screen invite-screen">
        <view class="completion-mark small">✓</view>
        <text class="eyebrow">你的部分已经保存</text>
        <text class="title">现在，邀请对方讲自己的版本。</text>
        <text class="description centered">对方会先在自己的私人空间表达。双方都确认后，你们才能看到共同视图。</text>
        <view class="room-card">
          <text class="room-label">沟通房间码</text>
          <text class="room-code">{{ room?.code }}</text>
          <text class="room-hint">长按或点击下方按钮分享</text>
        </view>
        <!-- #ifdef MP-WEIXIN -->
        <button class="primary full" open-type="share">微信邀请对方</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button class="primary full" @tap="shareInvite">分享邀请链接</button>
        <!-- #endif -->
        <button class="secondary refresh" :loading="busy" :disabled="busy" @tap="refreshRoom">
          {{ busy ? "正在确认进展" : "我已邀请，检查对方进展" }}
        </button>
        <view class="waiting-card">
          <text class="waiting-pulse" />
          <view><text class="waiting-title">等待对方确认</text><text class="waiting">你可以安全离开，重新打开后会回到这个房间。</text></view>
        </view>
      </view>

      <view v-else-if="stage === 'COMMON'" class="screen common-screen">
        <text class="eyebrow">双方都已确认</text>
        <text class="title">理解，不必同意。</text>
        <text class="description">共同视图只使用双方本人确认过的内容。先看见重叠，再看见真正不同的地方。</text>

        <view v-if="snapshot?.sharedView" class="shared-view">
          <view class="shared-section common-ground">
            <text class="card-label">共同点</text>
            <text class="shared-copy">{{ snapshot.sharedView.common_ground }}</text>
          </view>
          <view class="shared-section disagreement">
            <text class="card-label">真实分歧</text>
            <text class="shared-copy">{{ snapshot.sharedView.disagreement }}</text>
          </view>
          <view class="shared-section core-question">
            <text class="card-label">需要一起回答的问题</text>
            <text class="shared-copy">{{ snapshot.sharedView.core_question }}</text>
          </view>
        </view>

        <text class="section-title">双方确认的原意</text>
        <view
          v-for="item in snapshot?.approvedPerspectives ?? []"
          :key="item.role"
          class="shared-perspective"
        >
          <view class="speaker-heading">
            <text class="speaker-avatar">{{ item.role }}</text>
            <text>{{ item.role === "A" ? "发起者" : "受邀者" }}的版本</text>
          </view>
          <view v-for="(key, index) in perspectiveKeys" :key="key" class="perspective-row">
            <text>{{ perspectiveLabels[index] }}</text>
            <text>{{ item[key] }}</text>
          </view>
        </view>

        <view class="agreement-draft">
          <text class="card-label">把理解变成一次小实验</text>
          <text class="agreement-intro">不承诺永久改变，只写下一个双方都能尝试、7 天后可以复盘的做法。</text>
          <textarea
            v-model="agreementProposal"
            class="transcript agreement-input"
            :maxlength="2000"
            placeholder="例如：计划可能发生变化时，先发送一个“待定”信号，并约定下一次更新时间。"
          />
          <view class="review-date"><text>复盘时间</text><text>{{ reviewDateLabel }}</text></view>
        </view>
      </view>

      <view v-else-if="stage === 'AGREEMENT'" class="screen agreement-screen">
        <text class="eyebrow">不寻找永久正确答案</text>
        <text class="title">先试行一个可逆的办法</text>
        <text class="description">每个人都需要独立确认。接受这次实验，不等于承认自己之前是错的。</text>
        <view v-if="snapshot?.agreement" class="experiment-card">
          <view class="experiment-top"><text>7 天实验</text><text>可复盘 · 可调整</text></view>
          <text class="experiment-proposal">{{ snapshot.agreement.proposal }}</text>
          <view class="review-date light"><text>复盘时间</text><text>{{ formatReviewDate(snapshot.agreement.review_at) }}</text></view>
        </view>
        <view class="acceptance-list">
          <view v-for="role in participantRoles" :key="role" class="acceptance-row">
            <text class="acceptance-check" :class="{ accepted: isAccepted(role) }">{{ isAccepted(role) ? "✓" : "" }}</text>
            <view>
              <text class="acceptance-name">{{ role === "A" ? "发起者" : "受邀者" }}{{ room?.role === role ? "（我）" : "" }}</text>
              <text class="acceptance-status">{{ isAccepted(role) ? "已自愿接受" : "等待确认" }}</text>
            </view>
          </view>
        </view>
        <button
          class="primary full"
          :loading="busy"
          :disabled="busy || ownAccepted"
          @tap="acceptAgreement"
        >{{ ownAccepted ? "我已确认，等待对方" : "我愿意尝试这个办法" }}</button>
        <button
          v-if="isMockApi && ownAccepted"
          class="secondary refresh demo-action"
          :loading="busy"
          :disabled="busy"
          @tap="simulatePartnerAgreement"
        >演示：让对方确认</button>
        <button class="secondary refresh" :loading="busy" :disabled="busy" @tap="refreshRoom">刷新双方状态</button>
        <text class="privacy-note centered-note">只有双方都确认后，实验才会正式开始。</text>
      </view>

      <view v-else class="screen complete-screen">
        <view class="completion-mark">✓</view>
        <text class="eyebrow">这一次已经说开</text>
        <text class="title complete-title">不是谁赢了，<br />是你们终于在讨论同一个问题。</text>
        <text class="description centered">7 天后再评价这个办法是否有效。在那之前，它只是一次共同选择的尝试。</text>
        <view class="completion-summary">
          <text class="card-label">本次留下</text>
          <view class="summary-grid">
            <view><text class="summary-number">1</text><text>个共同点</text></view>
            <view><text class="summary-number">1</text><text>个真实分歧</text></view>
            <view><text class="summary-number">1</text><text>个可验证实验</text></view>
          </view>
        </view>
        <button class="primary full" @tap="startAnotherRoom">发起新的沟通</button>
      </view>

      <view class="scroll-spacer" />
    </scroll-view>

    <view v-if="showBottomBar" class="bottom-bar">
      <button v-if="canNavigateBack(stage)" class="back" @tap="goBack">返回修改</button>
      <view v-else class="back-placeholder" />
      <button
        class="primary next"
        :disabled="!canContinue || busy"
        :loading="busy"
        @tap="next"
      >{{ nextLabel }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from "vue";
import { onHide, onLoad, onShareAppMessage, onUnload } from "@dcloudio/uni-app";
import type { ClientStage } from "../../domain/room-state";
import { canNavigateBack, previousStage, stageForRoom } from "../../domain/room-state";
import { perspectiveFromDraft } from "../../domain/perspective";
import type { Perspective, RoomSession, RoomSnapshot } from "../../domain/types";
import { loginForPlatform, roomApi, transcribeAudio } from "../../services/api";
import { startRecording, stopRecording } from "../../services/recorder";
import {
  clearActiveRoom,
  clearEditorDraft,
  getActiveRoom,
  getEditorDraft,
  saveActiveRoom,
  saveEditorDraft,
} from "../../services/session";

type Notice = { kind: "info" | "success" | "error"; message: string };

const goals = [
  { title: "让我被准确理解", description: "把最在意的事实和影响说清楚" },
  { title: "理解对方为什么这样想", description: "先听见对方行动背后的理由" },
  { title: "找到一个双方都能尝试的下一步", description: "从争论结论转向一个小实验" },
];
const perspectiveKeys: Array<keyof Perspective> = ["fact", "meaning", "impact", "request"];
const perspectiveLabels = ["可观察事实", "我的理解", "对我的影响", "我的请求"];
const perspectivePlaceholders = [
  "只写可以被观察或核对的事情，避免评价对方的人格。",
  "这件事让你怎么理解当时的情况？",
  "它对你的感受、时间或关系造成了什么影响？",
  "你希望对方接下来具体做什么？",
];
const participantRoles = ["A", "B"] as const;
const isMockApi = __USE_MOCK_API__;
const phaseByStage: Record<ClientStage, { step: number; label: string }> = {
  WELCOME: { step: 0, label: "开始" },
  GOAL: { step: 1, label: "意图" },
  RECORD: { step: 2, label: "表达" },
  CLARIFY: { step: 2, label: "表达" },
  REVIEW: { step: 3, label: "确认" },
  INVITE: { step: 3, label: "确认" },
  COMMON: { step: 4, label: "共视" },
  AGREEMENT: { step: 5, label: "约定" },
  COMPLETE: { step: 5, label: "完成" },
};

const stage = ref<ClientStage>("WELCOME");
const room = ref<RoomSession | null>(null);
const snapshot = ref<RoomSnapshot | null>(null);
const goal = ref(goals[0].title);
const joinCode = ref("");
const contentScrollTop = ref(0);
const recording = ref(false);
const recordingSeconds = ref(0);
const busy = ref(false);
const transcript = ref("");
const clarification = ref("");
const agreementProposal = ref("");
const reviewAt = ref(defaultReviewAt());
const notice = ref<Notice | null>(null);
const perspective = reactive<Perspective>({ fact: "", meaning: "", impact: "", request: "" });
let recordingTimer: ReturnType<typeof setInterval> | null = null;
let editorSaveTimer: ReturnType<typeof setTimeout> | null = null;

watch(stage, () => {
  contentScrollTop.value = contentScrollTop.value === 0 ? 1 : 0;
}, { flush: "post" });

watch(recording, (isRecording) => {
  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = null;
  if (isRecording) {
    recordingSeconds.value = 0;
    recordingTimer = setInterval(() => {
      recordingSeconds.value = Math.min(120, recordingSeconds.value + 1);
    }, 1000);
  }
});

watch(
  [
    transcript,
    clarification,
    () => perspective.fact,
    () => perspective.meaning,
    () => perspective.impact,
    () => perspective.request,
  ],
  scheduleEditorDraftSave,
  { flush: "post" },
);

onUnmounted(() => {
  if (recordingTimer) clearInterval(recordingTimer);
  flushEditorDraft();
});

onHide(flushEditorDraft);
onUnload(flushEditorDraft);

const totalSteps = 5;
const currentStep = computed(() => phaseByStage[stage.value].step);
const currentPhaseLabel = computed(() => phaseByStage[stage.value].label);
const progressPercent = computed(() => (currentStep.value / totalSteps) * 100);
const showBottomBar = computed(() => ["GOAL", "RECORD", "CLARIFY", "REVIEW", "COMMON"].includes(stage.value));
const canContinue = computed(() => {
  if (stage.value === "RECORD") return transcript.value.trim().length > 0 && !recording.value;
  if (stage.value === "CLARIFY") return clarification.value.trim().length > 0;
  if (stage.value === "REVIEW") return Object.values(perspective).every((value) => value.trim().length > 0);
  if (stage.value === "COMMON") return agreementProposal.value.trim().length > 0;
  return true;
});
const nextLabel = computed(() => {
  if (stage.value === "REVIEW") return "确认并分享";
  if (stage.value === "COMMON") return "提出 7 天实验";
  return "继续";
});
const reviewDateLabel = computed(() => formatReviewDate(reviewAt.value));
const ownAccepted = computed(() => {
  const agreement = snapshot.value?.agreement;
  if (!agreement || !room.value) return false;
  return room.value.role === "A" ? agreement.accepted_a : agreement.accepted_b;
});

function defaultReviewAt() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(20, 0, 0, 0);
  return date.toISOString();
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "7 天后复盘";
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${weekdays[date.getDay()]} ${hour}:${minute}`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function setNotice(kind: Notice["kind"], text: string) {
  notice.value = { kind, message: text };
}

function updateRoom(nextRoom: RoomSession) {
  room.value = nextRoom;
  saveActiveRoom(nextRoom);
}

function isEditorStage(value: ClientStage) {
  return value === "RECORD" || value === "CLARIFY" || value === "REVIEW";
}

function flushEditorDraft() {
  if (editorSaveTimer) clearTimeout(editorSaveTimer);
  editorSaveTimer = null;
  if (!room.value || !isEditorStage(stage.value)) return;
  saveEditorDraft({
    roomId: room.value.roomId,
    role: room.value.role,
    transcript: transcript.value,
    clarification: clarification.value,
    perspective: { ...perspective },
  });
}

function scheduleEditorDraftSave() {
  if (editorSaveTimer) clearTimeout(editorSaveTimer);
  editorSaveTimer = setTimeout(flushEditorDraft, 250);
}

function restoreEditorDraft(roomSession: RoomSession) {
  if (!isEditorStage(stage.value)) return;
  const draft = getEditorDraft(roomSession.roomId, roomSession.role);
  if (!draft) return;
  transcript.value = draft.transcript;
  clarification.value = draft.clarification;
  Object.assign(perspective, draft.perspective);
}

function applySnapshot(latest: RoomSnapshot) {
  snapshot.value = latest;
  if (!room.value) return;
  updateRoom({ ...room.value, code: latest.room.code, state: latest.room.state });
  if (latest.room.goal) goal.value = latest.room.goal;
  if (latest.privateDraft) {
    transcript.value = latest.privateDraft.transcript;
    clarification.value = latest.privateDraft.clarification ?? "";
  }
  if (latest.ownPerspective) {
    Object.assign(perspective, latest.ownPerspective);
  } else if (
    latest.privateDraft &&
    (latest.room.state === "A_REVIEWING" || latest.room.state === "B_REVIEWING")
  ) {
    Object.assign(
      perspective,
      perspectiveFromDraft(latest.privateDraft.transcript, latest.privateDraft.clarification ?? ""),
    );
  }
  if (latest.agreement) agreementProposal.value = latest.agreement.proposal;
}

async function loadSnapshot(roomSession: RoomSession) {
  const latest = await roomApi.snapshot(roomSession.roomId);
  applySnapshot(latest);
  stage.value = stageForRoom(roomSession.role, latest.room.state);
  restoreEditorDraft(roomSession);
}

onLoad((options) => {
  const incomingRoom = typeof options?.room === "string"
    ? options.room.replace(/[^a-z0-9]/gi, "").slice(0, 7).toUpperCase()
    : "";
  if (incomingRoom) {
    joinCode.value = incomingRoom;
    return;
  }
  const savedRoom = getActiveRoom();
  if (!savedRoom) return;
  busy.value = true;
  room.value = savedRoom;
  stage.value = stageForRoom(savedRoom.role, savedRoom.state);
  restoreEditorDraft(savedRoom);
  void loadSnapshot(savedRoom)
    .then(() => setNotice("success", "已恢复上次的沟通进度。"))
    .catch(() => {
      setNotice("error", "暂时无法同步最新进展，房间信息已保留，可以稍后重试。 ");
    })
    .finally(() => { busy.value = false; });
});

onShareAppMessage(() => ({
  title: "我想和你把这件事说开",
  path: `/pages/index/index?room=${room.value?.code ?? ""}`,
}));

function normalizeJoinCode(event: Event) {
  const value = (event as unknown as { detail: { value: string } }).detail.value;
  joinCode.value = value.replace(/[^a-z0-9]/gi, "").slice(0, 7).toUpperCase();
}

async function createRoom() {
  notice.value = null;
  busy.value = true;
  try {
    await loginForPlatform();
    const created = await roomApi.create();
    clearEditorDraft();
    updateRoom(created);
    stage.value = stageForRoom(created.role, created.state);
    setNotice("success", "私人沟通空间已创建。先确认这次的意图。 ");
  } catch (error) {
    setNotice("error", message(error, "创建失败，请稍后重试。"));
  } finally {
    busy.value = false;
  }
}

async function joinRoom() {
  if (joinCode.value.length !== 7) {
    setNotice("error", "请输入完整的 7 位房间码。 ");
    return;
  }
  notice.value = null;
  busy.value = true;
  try {
    const joined = await roomApi.join(joinCode.value);
    clearEditorDraft();
    updateRoom(joined);
    const joinedStage = stageForRoom(joined.role, joined.state);
    if (["COMMON", "AGREEMENT", "COMPLETE"].includes(joinedStage)) await loadSnapshot(joined);
    else stage.value = joinedStage;
    setNotice("success", "已进入沟通房间。你的草稿不会直接分享给对方。 ");
  } catch (error) {
    setNotice("error", message(error, "加入失败，请检查房间码后重试。"));
  } finally {
    busy.value = false;
  }
}

async function toggleRecording() {
  notice.value = null;
  try {
    if (!recording.value) {
      const { completion } = await startRecording();
      recording.value = true;
      void completion
        .then(async (audio) => {
          recording.value = false;
          busy.value = true;
          const text = await transcribeAudio(audio);
          transcript.value = transcript.value.trim() ? `${transcript.value.trim()}\n${text}` : text;
          setNotice("success", "转写完成，你可以继续修改文字。 ");
        })
        .catch((error) => {
          recording.value = false;
          setNotice("error", message(error, "录音失败，请改用文字输入。"));
        })
        .finally(() => { busy.value = false; });
      return;
    }
    stopRecording();
  } catch (error) {
    recording.value = false;
    setNotice("error", message(error, "录音失败，请改用文字输入。"));
  }
}

async function next() {
  if (!room.value || !canContinue.value) return;
  notice.value = null;
  busy.value = true;
  try {
    if (stage.value === "GOAL") {
      const result = await roomApi.setGoal(room.value.roomId, goal.value);
      updateRoom({ ...room.value, state: result.state });
      stage.value = "RECORD";
    } else if (stage.value === "RECORD") {
      stage.value = "CLARIFY";
    } else if (stage.value === "CLARIFY") {
      const result = await roomApi.saveDraft(room.value.roomId, transcript.value.trim(), clarification.value.trim());
      updateRoom({ ...room.value, state: result.state });
      Object.assign(perspective, perspectiveFromDraft(transcript.value, clarification.value));
      stage.value = "REVIEW";
    } else if (stage.value === "REVIEW") {
      const approved = await roomApi.approvePerspective(room.value.roomId, {
        fact: perspective.fact.trim(),
        meaning: perspective.meaning.trim(),
        impact: perspective.impact.trim(),
        request: perspective.request.trim(),
      });
      if (editorSaveTimer) clearTimeout(editorSaveTimer);
      editorSaveTimer = null;
      clearEditorDraft();
      updateRoom({ ...room.value, state: approved.state });
      if (stageForRoom(room.value.role, approved.state) === "COMMON") {
        await loadSnapshot(room.value);
        setNotice("success", "双方都已确认，现在可以查看共同视图。 ");
      } else {
        stage.value = "INVITE";
        setNotice("success", "你的版本已确认，不会再分享草稿内容。 ");
      }
    } else if (stage.value === "COMMON") {
      const result = await roomApi.proposeAgreement(room.value.roomId, agreementProposal.value.trim(), reviewAt.value);
      updateRoom({ ...room.value, state: result.state });
      await loadSnapshot(room.value);
      setNotice("success", "实验已提出，等待双方分别确认。 ");
    }
  } catch (error) {
    setNotice("error", message(error, "操作没有完成，请稍后重试。"));
  } finally {
    busy.value = false;
  }
}

async function refreshRoom() {
  if (!room.value) return;
  notice.value = null;
  busy.value = true;
  const previousState = room.value.state;
  try {
    await loadSnapshot(room.value);
    if (stage.value === "COMPLETE") setNotice("success", "双方已确认，7 天实验现在开始。 ");
    else if (room.value.state !== previousState) setNotice("success", "已同步对方的最新进展。 ");
    else setNotice("info", stage.value === "AGREEMENT" ? "对方还没有确认，可以稍后再刷新。" : "对方还在整理自己的版本。 ");
  } catch (error) {
    setNotice("error", message(error, "刷新失败，请稍后重试。"));
  } finally {
    busy.value = false;
  }
}

async function shareInvite() {
  if (!room.value) return;
  const fallback = `我想和你把这件事说开。沟通房间码：${room.value.code}`;
  const shareUrl = typeof location === "undefined"
    ? fallback
    : `${location.origin}${location.pathname}?room=${room.value.code}`;
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: "我想和你把这件事说开", text: fallback, url: shareUrl });
      setNotice("success", "邀请已分享。 ");
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  uni.setClipboardData({
    data: shareUrl,
    success: () => setNotice("success", "邀请链接已复制。 "),
    fail: () => setNotice("error", "无法复制，请手动分享房间码。 "),
  });
}

function isAccepted(role: "A" | "B") {
  const agreement = snapshot.value?.agreement;
  return role === "A" ? Boolean(agreement?.accepted_a) : Boolean(agreement?.accepted_b);
}

async function acceptAgreement() {
  if (!room.value || ownAccepted.value) return;
  notice.value = null;
  busy.value = true;
  try {
    const result = await roomApi.acceptAgreement(room.value.roomId);
    updateRoom({ ...room.value, state: result.state });
    await loadSnapshot(room.value);
    setNotice(
      result.activated ? "success" : "info",
      result.activated ? "双方已确认，7 天实验现在开始。" : "你已确认，正在等待对方。",
    );
  } catch (error) {
    setNotice("error", message(error, "确认失败，请稍后重试。"));
  } finally {
    busy.value = false;
  }
}

async function simulatePartnerAgreement() {
  if (!room.value || !isMockApi) return;
  notice.value = null;
  busy.value = true;
  try {
    const result = await roomApi.simulatePartnerAcceptance();
    updateRoom({ ...room.value, state: result.state });
    await loadSnapshot(room.value);
    setNotice("success", "演示中的对方已独立确认，7 天实验现在开始。 ");
  } catch (error) {
    setNotice("error", message(error, "无法完成对方确认演示。"));
  } finally {
    busy.value = false;
  }
}

function goBack() {
  notice.value = null;
  stage.value = previousStage(stage.value);
}

function startAnotherRoom() {
  clearActiveRoom();
  clearEditorDraft();
  room.value = null;
  snapshot.value = null;
  transcript.value = "";
  clarification.value = "";
  agreementProposal.value = "";
  Object.assign(perspective, { fact: "", meaning: "", impact: "", request: "" });
  reviewAt.value = defaultReviewAt();
  notice.value = null;
  stage.value = "WELCOME";
}
</script>

<style lang="scss" src="./index.scss"></style>
