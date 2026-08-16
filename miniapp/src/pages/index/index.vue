<template>
  <view class="page-shell" :class="`stage-${stage.toLowerCase()}`">
    <view class="topbar">
      <button
        v-if="stage !== 'WELCOME'"
        class="room-back"
        aria-label="返回首页"
        :disabled="busy && (stage !== 'CLARIFICATION_CHAT' || !aiJobId)"
        @tap="returnToWelcome"
      >
        <text class="room-back-arrow">←</text>
        <text>返回</text>
      </button>
      <view class="brand-lockup" :class="{ 'brand-lockup-room': stage !== 'WELCOME' }">
        <text class="brand">说开</text>
        <text class="brand-en">SHUOKAI</text>
      </view>
      <view v-if="stage !== 'WELCOME'" class="progress-meta">
        <text class="progress-label">{{ currentPhaseLabel }}</text>
        <text class="progress-copy">{{ currentStep }} / {{ totalSteps }}</text>
      </view>
      <button
        v-if="authUserId"
        class="account-trigger"
        :disabled="busy"
        aria-label="打开我的空间"
        @tap="openAccountSpace"
      ><text class="account-avatar">{{ accountMark }}</text><text>我的空间</text></button>
      <view v-if="stage !== 'WELCOME'" class="progress-track">
        <view class="progress-fill" :style="{ width: `${progressPercent}%` }" />
      </view>
    </view>

    <AccountSpace
      ref="accountSpaceRef"
      :open="accountOpen"
      :platform-label="accountPlatform.platformLabel"
      :identity="accountPlatform.identity"
      :login-status="accountPlatform.loginStatus"
      :room-code="room?.code ?? ''"
      :room-phase="accountRoomPhase"
      :room-role="accountRoomRole"
      :draft-status="accountDraftStatus"
      :can-sign-out="isLiveH5"
      :platform-note="accountPlatform.platformNote"
      :current-room-id="room?.roomId ?? ''"
      :history-items="roomHistory"
      :history-loading="historyLoading"
      :history-error="historyError"
      :history-has-more="Boolean(roomHistoryCursor)"
      :ai-conversation-items="aiConversationHistory"
      :personal-memories="aiMemories.personal"
      :relationship-memories="aiMemories.relationship"
      :ai-archive-loading="aiArchiveLoading"
      :ai-archive-error="aiArchiveError"
      :busy="busy"
      :display-name="profile.displayName"
      @close="accountOpen = false"
      @edit-profile="openProfileEditor"
      @signout="requestH5Logout"
      @refresh-history="loadRoomHistory(true)"
      @load-more-history="loadRoomHistory(false)"
      @open-history="openHistoricalRoom"
      @refresh-ai-data="loadAiArchive"
      @open-ai-history="openAiConversationHistory"
      @decide-memory="decidePersonalMemory"
      @edit-memory="editPersonalMemory"
      @forget-memory="confirmForgetPersonalMemory"
      @decide-relationship-memory="decideRelationshipMemory"
    />

    <ProfileOnboarding
      :open="profileOpen"
      :profile="profile"
      :saved-draft="profileDraft"
      :busy="profileBusy"
      :error="profileError"
      @close="closeProfileEditor"
      @save="saveProfile"
      @clear="clearProfilePreferences"
      @draft-change="persistProfileDraft"
    />

    <view
      v-if="notice"
      class="notice"
      :class="`notice-${notice.kind}`"
      role="status"
      @tap="clearNotice"
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
      :scroll-into-view="contentScrollIntoView"
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
          <text class="lead">不裁判谁对谁错。沿着观察、感受、需要、请求四步，再一起看清真正的分歧。</text>
        </view>

        <H5AuthPanel
          v-if="isLiveH5 && !authUserId"
          :disabled="busy"
          @authenticated="handleH5Authenticated"
          @notice="setNotice"
        />

        <view v-else class="entry-panel">
          <button v-if="authUserId" class="welcome-account" @tap="openAccountSpace">
            <view class="welcome-account-copy">
              <text class="account-copy">{{ accountPlatform.loginStatus }}</text>
              <text class="account-identity">{{ accountPlatform.identity }}</text>
            </view>
            <view class="welcome-account-link"><text>我的空间</text><text>→</text></view>
          </button>
          <view v-if="room" class="resume-room">
            <view class="resume-room-copy">
              <text class="resume-room-label">当前沟通</text>
              <text class="resume-room-code">{{ room.code }}</text>
            </view>
            <button class="primary full" :loading="busy" :disabled="busy" @tap="resumeCurrentRoom">
              继续当前沟通
            </button>
            <button class="secondary new-room" :disabled="busy" @tap="createRoom">
              发起新的沟通
            </button>
          </view>
          <button v-else class="primary full" :loading="busy" :disabled="busy" @tap="createRoom">
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

      <RelationshipOnboarding
        v-else-if="(stage === 'RELATIONSHIP_SETUP' || stage === 'RELATIONSHIP_CONFIRMATION') && relationshipContext"
        ref="relationshipOnboardingRef"
        class="screen"
        :role="stage === 'RELATIONSHIP_SETUP' ? 'A' : 'B'"
        :context="relationshipContext"
        :saved-draft="relationshipDraft"
        :busy="busy"
        :error="relationshipError"
        @draft-change="persistRelationshipDraft"
        @checkpoint="saveRelationshipCheckpoint"
        @save="saveRelationshipOnboarding"
        @leave="returnToWelcome"
      />

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

      <InvitationIntro
        v-else-if="stage === 'INVITATION_INTRO'"
        :context="resolvedInvitationContext"
        :status="invitationContextStatus"
        :clarification-message="currentInvitationClarificationMessage"
        :clarifying="invitationClarifying"
        :busy="busy"
        @start="startInvitedExpression"
        @clarify="invitationClarifying = true"
        @back="invitationClarifying = false"
        @retry="refreshInvitationContext()"
        @copy-request="copyInvitationClarification"
        @leave="leaveInvitation"
      />

      <ExpressionDiscovery
        v-else-if="stage === 'RECORD' && room"
        :source-text="transcript"
        :answer="clarificationAnswer"
        :turns="clarificationTurns"
        :question="discoveryQuestion"
        :started="discoveryStarted"
        :ready="discoveryReady"
        :mode-selection-open="discoveryModeSelectionOpen"
        :selected-mode="selectedMode"
        :busy="busy"
        :thinking="discoveryThinking"
        :recording="recording"
        :recording-seconds="recordingSeconds"
        :role="room.role"
        :invitation-topic="resolvedInvitationContext.title"
        :invitation-status="invitationContextStatus"
        :safety-disposition="discoverySafetyDisposition"
        :safety-message="discoverySafetyMessage"
        :restored="discoveryRestored"
        :failure-message="discoveryFailureMessage"
        :save-state="discoverySaveState"
        :memory-proposals="discoveryMemoryProposals"
        :detached-drafts="discoveryDetachedDrafts"
        :read-only="aiConversationArchiveReadOnly"
        @update:source-text="transcript = $event"
        @update:answer="clarificationAnswer = $event"
        @send="sendDiscoveryMessage"
        @finish="finishDiscovery"
        @select-mode="chooseExpressionMode"
        @continue-after-failure="continueDiscoveryAfterFailure"
        @record="toggleRecording"
        @view-invitation="showInvitationIntro"
        @retry-invitation="refreshInvitationContext()"
        @decide-memory="decidePersonalMemory"
        @edit-memory="editPersonalMemory"
        @local-change="expressionDiscovery.markLocalDraft"
        @restore-detached-draft="expressionDiscovery.reapplyDetachedDraft"
        @discard-detached-draft="confirmDiscardDetachedDraft"
      />

      <ExpressionModeChooser
        v-else-if="stage === 'MODE_SELECT'"
        v-model="selectedMode"
        @manual="beginManualExpression"
      />

      <view v-else-if="stage === 'AI_PENDING'" class="screen ai-pending-screen">
        <view class="ai-orbit"><text class="ai-orbit-core">AI</text></view>
        <text class="eyebrow">{{ aiJobId ? "私人整理中" : "理解层生成中" }}</text>
        <text class="title">{{ aiJobId ? "正在把原话放进你选择的表达路径。" : "正在对齐共同点，也保留真正的不同。" }}</text>
        <text class="description centered">{{ aiJobId ? "这里不会判断谁对谁错，也不会自动分享。通常只需要十几秒，你仍然拥有最后的删改与确认权。" : "共识 Agent 会读取双方确认分享的表达卡与刚才的多轮沟通；审查 Agent 会检查虚假共识、争议事实和边界弱化。" }}</text>
        <view v-if="aiJobId" class="ai-steps">
          <view class="ai-step done"><text>✓</text><text>读取本次原话</text></view>
          <view class="ai-step active"><text class="processing-dot" /><text>整理表达卡</text></view>
          <view class="ai-step"><text>3</text><text>等待本人确认表达卡</text></view>
        </view>
        <view v-else class="ai-steps">
          <view class="ai-step done"><text>✓</text><text>双方表达已确认</text></view>
          <view class="ai-step active"><text class="processing-dot" /><text>生成并独立审查共同理解</text></view>
          <view class="ai-step"><text>3</text><text>双方分别确认是否准确</text></view>
        </view>
        <view v-if="understandingFailure" class="understanding-failure">
          <text>本次没有生成可安全展示的共同理解</text>
          <text>{{ understandingFailure }}</text>
          <text>系统不会展示未经审查的半成品，双方已经确认的表达仍然保留。</text>
        </view>
        <button v-if="aiJobId" class="secondary refresh" @tap="stopWaitingForExpression">
          {{ clarificationTurns.length ? "不等了，保留上一版草稿" : "不等了，改为手动填写" }}
        </button>
        <button v-else-if="understandingFailure && understandingRetryAllowed" class="secondary refresh" @tap="ensureSharedUnderstanding">重新尝试</button>
        <view v-else-if="understandingFailure" class="understanding-recovery-actions">
          <button class="secondary refresh" @tap="editOwnExpression">修改我的表达</button>
          <button class="secondary refresh subtle" @tap="pauseFromUnderstanding">暂停这次沟通</button>
        </view>
        <button v-else class="secondary refresh" @tap="pollUnderstanding">检查生成进展</button>
      </view>

      <ExpressionReview
        v-else-if="stage === 'EXPRESSION_REVIEW'"
        :model-value="editableExpression"
        :source-text="transcript"
        :current-step="expressionReviewStep"
        @update-field="updateExpressionField"
        @update-invitation="updateInvitationDraft"
        @change-mode="changeExpressionMode"
        @edit-step="expressionReviewStep = $event"
      />

      <ExpressionClarification
        v-else-if="stage === 'CLARIFICATION_CHAT'"
        :question="currentClarificationQuestion"
        :answer="clarificationAnswer"
        :turns="clarificationTurns"
        :busy="busy"
        :source-text="transcript"
        :mode-title="currentExpressionOption.title"
        :model-value="editableExpression"
        :organization-pending="Boolean(aiJobId)"
        :organization-failure="expressionOrganizationFailure"
        :updated-field-keys="expressionUpdatedFieldKeys"
        @update:answer="clarificationAnswer = $event"
        @continue="continueClarification"
        @retry="retryExpressionOrganization"
        @confirm="confirmExpressionWorkspace"
        @update-field="updateExpressionField"
        @update-invitation="updateInvitationDraft"
        @change-mode="changeExpressionMode"
      />

      <GuidedDialogue
        v-else-if="stage === 'DIALOGUE' && dialogueState"
        :state="dialogueState"
        :busy="busy"
        :read-only="historyReadOnly"
        @submit="submitDialogueText"
        @confirm="confirmDialogueReflection"
        @refresh="refreshDialogue"
        @pause="pauseFromDialogue"
        @summarize="finishDialogueRound"
        @close-history="stage = 'COMPLETE'"
      />

      <view v-else-if="stage === 'PAUSED'" class="screen paused-screen">
        <view class="pause-mark">Ⅱ</view>
        <text class="eyebrow">沟通已暂停</text>
        <text class="title">现在不继续，也是一种清楚的选择。</text>
        <text class="description centered">系统不会生成双方共识，也不会把私人原话分享给对方。房间会真实显示为“已暂停”。</text>
        <button class="primary full" @tap="returnToWelcome">回到首页</button>
      </view>

      <NvcStepEditor
        v-else-if="activeNvcCard"
        :model-value="perspective[activeNvcCard.key]"
        :card="activeNvcCard"
        :index="activeNvcIndex"
        :perspective="perspective"
        :privacy-note="editorPrivacyNote"
        @update:model-value="updateActiveNvcValue"
      />

      <NvcReviewSummary
        v-else-if="stage === 'REVIEW'"
        :perspective="perspective"
        @edit="editNvcCard"
      />

      <view v-else-if="stage === 'INVITE'" class="screen invite-screen">
        <view class="completion-mark small">✓</view>
        <text class="eyebrow">你的部分已经保存</text>
        <text class="title">现在，邀请对方讲自己的版本。</text>
        <text class="description centered">对方会先看见一段你确认过的主题说明，再在自己的私人空间表达。不会提前看到其余表达内容或私人草稿。</text>
        <view class="invite-preview">
          <view class="invite-preview-meta">
            <text class="invite-preview-label">对方将先看到</text>
            <text class="invite-preview-method">{{ resolvedInvitationContext.confirmedSummary ? "已随表达卡固定" : invitationContextStatus === "loading" ? "正在读取" : "根据确认内容整理" }}</text>
          </view>
          <text class="invite-preview-topic">{{ resolvedInvitationContext.title }}</text>
          <text class="invite-preview-summary">{{ resolvedInvitationContext.summary }}</text>
          <text class="invite-preview-note">摘要只使用表达卡里已经确认的事件背景。对方仍会从自己的视角讲述，不会先看到你的其余表达或私人对话。</text>
          <button class="invite-preview-edit" :disabled="busy" @tap="editOwnExpression">这段说明不准确，返回修改</button>
        </view>
        <view class="room-card">
          <text class="room-label">沟通房间码</text>
          <text class="room-code">{{ room?.code }}</text>
          <text class="room-hint">长按或点击下方按钮分享</text>
        </view>
        <!-- #ifdef MP-WEIXIN -->
        <button class="primary full" open-type="share" :disabled="!resolvedInvitationContext.topic">微信邀请对方</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button class="primary full" :disabled="!resolvedInvitationContext.topic" @tap="shareInvite">分享邀请链接</button>
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
        <SharedUnderstanding
          v-if="isV2Room && understandingStatus?.result"
          :result="understandingStatus.result.payload"
          :own-decision="understandingStatus.ownDecision"
          :accurate-count="understandingStatus.accurateCount"
          :room-code="room?.code ?? ''"
          :busy="busy"
          @decide="decideUnderstanding"
          @edit-own="editOwnExpression"
          @share-room="shareRoomLink"
          @pause="pauseFromUnderstanding"
        />
        <template v-else>
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
          <view v-for="card in nvcPerspectiveCards" :key="card.key" class="perspective-row">
            <text>{{ card.label }}</text>
            <text>{{ item[card.key] }}</text>
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
        </template>
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
        <button class="secondary refresh" :loading="busy" :disabled="busy" @tap="refreshRoom">刷新双方状态</button>
        <text class="privacy-note centered-note">只有双方都确认后，实验才会正式开始。</text>
      </view>

      <view v-else-if="stage === 'COMPLETE'" class="screen complete-screen">
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
        <button
          v-if="dialogueState?.turns.length"
          class="secondary full"
          @tap="openArchivedDialogue"
        >回看完整沟通记录</button>
        <button class="primary full" @tap="startAnotherRoom">发起新的沟通</button>
      </view>

      <view v-else class="screen ai-pending-screen">
        <view class="ai-orbit"><text class="ai-orbit-core">···</text></view>
        <text class="eyebrow">正在恢复沟通</text>
        <text class="title">正在读取双方刚才的进展。</text>
        <text class="description centered">这里不会把尚未完成的沟通显示成“已经说开”。如果等待较久，可以重新检查房间状态。</text>
        <button class="secondary refresh" :loading="busy" :disabled="busy" @tap="refreshRoom">重新检查进展</button>
      </view>

      <view class="scroll-spacer" />
    </scroll-view>

    <view v-if="showBottomBar" class="bottom-bar">
      <button v-if="canNavigateBack(stage)" class="back" @tap="goBack">{{ backLabel }}</button>
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
import { computed, nextTick, onUnmounted, reactive, ref, watch } from "vue";
import { onHide, onLoad, onShareAppMessage, onUnload } from "@dcloudio/uni-app";
import type { ClientStage } from "../../domain/room-state";
import {
  canNavigateBack,
  isEditorClientStage,
  previousStage,
  shouldLoadSnapshotAfterJoin,
  stageForRoom,
} from "../../domain/room-state";
import {
  accountPlatformSummary,
  draftStatusLabel,
  roomPhaseLabel,
  roomRoleLabel,
  type DraftSaveState,
} from "../../domain/account-status";
import {
  nextNvcStage,
  nvcCardForStage,
  nvcPerspectiveCards,
  nvcStageForKey,
} from "../../domain/nvc";
import { createNvcPerspective } from "../../domain/perspective";
import type { Perspective, RoomSession, RoomSnapshot } from "../../domain/types";
import AccountSpace from "../../components/AccountSpace.vue";
import H5AuthPanel from "../../components/H5AuthPanel.vue";
import NvcReviewSummary from "../../components/NvcReviewSummary.vue";
import NvcStepEditor from "../../components/NvcStepEditor.vue";
import ExpressionModeChooser from "../../components/ExpressionModeChooser.vue";
import ExpressionDiscovery from "../../components/ExpressionDiscovery.vue";
import ExpressionClarification from "../../components/ExpressionClarification.vue";
import ExpressionReview from "../../components/ExpressionReview.vue";
import SharedUnderstanding from "../../components/SharedUnderstanding.vue";
import GuidedDialogue from "../../components/GuidedDialogue.vue";
import InvitationIntro from "../../components/InvitationIntro.vue";
import ProfileOnboarding from "../../components/ProfileOnboarding.vue";
import RelationshipOnboarding from "../../components/RelationshipOnboarding.vue";
import {
  emptyParticipantContextDraft,
  emptyProfileDraft,
  emptySharedContextDraft,
  type ParticipantContextDraft,
  type ProfileDraft,
  type RoomRelationshipContext,
  type SharedContextDraft,
  type UserProfile,
} from "../../domain/profile-context";
import {
  createEditableExpression,
  expressionFieldProgress,
  expressionModeOption,
  expressionIsComplete,
  expressionSharePayload,
  expressionAfterFieldEdit,
  invitationDraftFromExpression,
  invitationDraftIsComplete,
  mergeAiExpressionCandidate,
  parseAiExpressionCandidate,
  type EditableExpression,
  type ExpressionMode,
} from "../../domain/expression";
import {
  composeClarificationSource,
  expressionCandidateClarificationQuestion,
  nextClarificationQuestion,
  optionalClarificationQuestion,
  parseClarificationSource,
  shouldPreserveDraftOnAiExit,
  type ClarificationTurn,
} from "../../domain/clarification";
import type { DialogueState } from "../../domain/dialogue";
import { expressionJobFailureMessage } from "../../domain/expression-job";
import type {
  AiConversationHistoryItem,
  AiMemoryCollection,
  PersonalMemoryItem,
  RelationshipMemoryItem,
} from "../../domain/ai-memory";
import {
  roomSessionFromHistory,
  type RoomHistoryItem,
} from "../../domain/room-history";
import {
  expressionReviewIsSummary as isExpressionReviewSummary,
  expressionReviewSummaryStep,
} from "../../domain/expression-review";
import {
  invitationContextFromEditableExpression,
  invitationClarificationMessage,
  type InvitationContextStatus,
  type InvitationContext,
} from "../../domain/invitation";
import {
  ApiError,
  loginForPlatform,
  requestExpressionOrganization,
  requestSharedUnderstanding,
  roomApi,
  profileApi,
  transcribeAudio,
} from "../../services/api";
import { useSharedUnderstanding } from "../../composables/use-shared-understanding";
import { useRoomHistory } from "../../composables/use-room-history";
import { useExpressionDiscovery } from "../../composables/use-expression-discovery";
import { restoreH5Auth, signOutH5, type H5AuthResult } from "../../services/auth";
import { createNoticeController, type Notice } from "../../services/notice";
import { userFacingErrorMessage } from "../../services/user-facing-error";
import { startRecording, stopRecording } from "../../services/recorder";
import {
  clearEditorDraft,
  clearActiveRoom,
  clearPrivateDeviceData,
  acknowledgeInvitation,
  getActiveRoom,
  getEditorDraft,
  hasAcknowledgedInvitation,
  saveActiveRoom,
  saveEditorDraft,
} from "../../services/session";
import {
  clearProfileContextDraftsForUser,
  clearProfileDraft,
  clearRelationshipDraft,
  discardForeignProfileContextDrafts,
  getProfileDraft,
  getRelationshipDraft,
  rebaseRelationshipDraft,
  saveProfileDraft,
  saveRelationshipDraft,
  type RelationshipDraft,
} from "../../services/profile-context-session";
import { runCommittedRoomEntry } from "../../services/room-entry";
import {
  createRelationshipOnboardingSubmitter,
  relationshipOnboardingStage,
} from "../../services/relationship-onboarding-flow";

const goals = [
  { title: "让我被准确理解", description: "把观察、感受和真正的需要说清楚" },
  { title: "理解对方为什么这样想", description: "先听见对方行动背后的理由" },
  { title: "找到一个双方都能尝试的下一步", description: "从争论结论转向一个小实验" },
];
const participantRoles = ["A", "B"] as const;
const isLiveH5 = __PLATFORM__ === "h5";
const phaseByStage: Record<ClientStage, { step: number; label: string }> = {
  WELCOME: { step: 0, label: "开始" },
  RELATIONSHIP_SETUP: { step: 1, label: "关系背景" },
  RELATIONSHIP_CONFIRMATION: { step: 1, label: "确认背景" },
  INVITATION_INTRO: { step: 1, label: "邀请" },
  GOAL: { step: 1, label: "意图" },
  RECORD: { step: 2, label: "AI 对话" },
  MODE_SELECT: { step: 2, label: "路径" },
  AI_PENDING: { step: 2, label: "AI 整理" },
  CLARIFICATION_CHAT: { step: 2, label: "AI 对话" },
  EXPRESSION_REVIEW: { step: 3, label: "确认" },
  PAUSED: { step: 2, label: "暂停" },
  NVC_OBSERVATION: { step: 2, label: "整理" },
  NVC_FEELING: { step: 2, label: "整理" },
  NVC_NEED: { step: 2, label: "整理" },
  NVC_REQUEST: { step: 2, label: "整理" },
  REVIEW: { step: 3, label: "确认" },
  INVITE: { step: 3, label: "确认" },
  COMMON: { step: 4, label: "共视" },
  DIALOGUE: { step: 4, label: "对话" },
  AGREEMENT: { step: 5, label: "约定" },
  COMPLETE: { step: 5, label: "完成" },
};

const stage = ref<ClientStage>("WELCOME");
const room = ref<RoomSession | null>(null);
const snapshot = ref<RoomSnapshot | null>(null);
const goal = ref(goals[0].title);
const joinCode = ref("");
const contentScrollTop = ref(0);
const contentScrollIntoView = ref("");
const recording = ref(false);
const recordingSeconds = ref(0);
const busy = ref(false);
const transcript = ref("");
const agreementProposal = ref("");
const reviewAt = ref(defaultReviewAt());
const notice = ref<Notice | null>(null);
const noticeController = createNoticeController((nextNotice) => { notice.value = nextNotice; });
const authEmail = ref("");
const authUserId = ref("");
const accountOpen = ref(false);
const accountSpaceRef = ref<{ focusProfileEntry: () => void } | null>(null);
const profileReturnToAccount = ref(false);
const profile = ref<UserProfile>({
  status: "MISSING",
  displayName: "",
  responseLength: null,
  language: null,
  useResponseLengthAi: true,
  useLanguageAi: true,
  revision: 0,
  consentRevision: 0,
  updatedAt: null,
});
const profileOpen = ref(false);
const profileBusy = ref(false);
const profileError = ref("");
const profileDraft = ref<ProfileDraft | null>(null);
const pendingProfileAction = ref<"CREATE" | "JOIN" | null>(null);
const relationshipContext = ref<RoomRelationshipContext | null>(null);
const relationshipDraft = ref<RelationshipDraft | null>(null);
const relationshipError = ref("");
const relationshipOnboardingRef = ref<{ focusError: () => Promise<void> } | null>(null);
const relationshipSubmitter = createRelationshipOnboardingSubmitter<RoomRelationshipContext>({
  setPending: (pending) => { busy.value = pending; },
  clearError: () => { relationshipError.value = ""; },
  applySuccess: ({ context, role, stage: nextStage }) => {
    if (!room.value) return;
    relationshipContext.value = context;
    relationshipDraft.value = null;
    stage.value = nextStage;
    try {
      clearRelationshipDraft(authUserId.value, room.value.roomId, role);
    } catch {
      // The server commit is authoritative; stale local data is revision-gated on the next restore.
    }
    if (role === "B" && nextStage === "INVITATION_INTRO") void refreshInvitationContext(room.value.roomId);
  },
  applyError: (error) => { relationshipError.value = error; },
  focusError: async () => {
    contentScrollTop.value = 0;
    await nextTick();
    await relationshipOnboardingRef.value?.focusError();
  },
});
const history = useRoomHistory(authUserId, roomApi.history);
const roomHistory = history.items;
const roomHistoryCursor = history.cursor;
const historyLoading = history.loading;
const historyError = history.error;
const resetRoomHistory = history.reset;
const loadRoomHistory = history.load;
const draftSaveState = ref<DraftSaveState>("empty");
const perspective = reactive<Perspective>(createNvcPerspective());
const selectedMode = ref<ExpressionMode | null>(null);
const editableExpression = ref<EditableExpression>(createEditableExpression("NVC"));
const workspaceRevision = ref(0);
const aiJobId = ref("");
const expressionOrganizationFailure = ref("");
const expressionUpdatedFieldKeys = ref<string[]>([]);
const clarificationTurns = ref<ClarificationTurn[]>([]);
const clarificationAnswer = ref("");
const clarificationSkipped = ref(false);
const invitationContext = ref<InvitationContext | null>(null);
const invitationContextStatus = ref<InvitationContextStatus>("idle");
const invitationClarifying = ref(false);
const expressionReviewStep = ref(0);
const dialogueState = ref<DialogueState | null>(null);
const historyReadOnly = ref(false);
const aiConversationArchiveReadOnly = ref(false);
const aiConversationHistory = ref<AiConversationHistoryItem[]>([]);
const aiMemories = ref<AiMemoryCollection>({ personal: [], relationship: [] });
const aiArchiveLoading = ref(false);
const aiArchiveError = ref("");
let recordingTimer: ReturnType<typeof setInterval> | null = null;
let editorSaveTimer: ReturnType<typeof setTimeout> | null = null;
let aiPollTimer: ReturnType<typeof setTimeout> | null = null;
let invitationContextRequest = 0;
let recordingTarget: "transcript" | "answer" = "transcript";
const expressionDiscovery = useExpressionDiscovery({
  room, busy, recording, transcript, selectedMode,
  turns: clarificationTurns,
  answer: clarificationAnswer,
  setNotice, clearNotice, formatError: message,
});
const discoveryStarted = expressionDiscovery.started;
const discoveryQuestion = expressionDiscovery.question;
const discoveryReady = expressionDiscovery.ready;
const discoveryUnderstanding = expressionDiscovery.understanding;
const discoverySafetyDisposition = expressionDiscovery.safetyDisposition;
const discoverySafetyMessage = expressionDiscovery.safetyMessage;
const discoveryThinking = expressionDiscovery.thinking;
const discoveryRestored = expressionDiscovery.restored;
const discoveryFailureMessage = expressionDiscovery.failureMessage;
const discoveryModeSelectionOpen = expressionDiscovery.modeSelectionOpen;
const discoverySaveState = expressionDiscovery.saveState;
const discoveryMemoryProposals = expressionDiscovery.memoryProposals;
const discoveryDetachedDrafts = expressionDiscovery.detachedDrafts;
const sendDiscoveryMessage = expressionDiscovery.send;
const finishDiscovery = expressionDiscovery.finish;
const continueDiscoveryAfterFailure = expressionDiscovery.continueAfterFailure;
const sharedUnderstanding = useSharedUnderstanding({
  room, stage, busy, transcript, selectedMode, workspaceRevision,
  updateRoom, setNotice, clearNotice, formatError: message, confirmPause,
});
const understandingStatus = sharedUnderstanding.status;
const understandingFailure = sharedUnderstanding.failure;
const understandingRetryAllowed = sharedUnderstanding.retryAllowed;
const ensureSharedUnderstanding = sharedUnderstanding.ensure;
const pollUnderstanding = sharedUnderstanding.poll;
const decideUnderstanding = sharedUnderstanding.decide;
const editOwnExpression = sharedUnderstanding.editOwnExpression;
const pauseFromUnderstanding = sharedUnderstanding.pause;
let workspaceGeneration = 0;

watch(stage, () => {
  contentScrollTop.value = contentScrollTop.value === 0 ? 1 : 0;
}, { flush: "post" });

watch(
  [discoveryThinking, discoveryReady, discoveryModeSelectionOpen, () => clarificationTurns.value.length],
  async () => {
    if (stage.value !== "RECORD") return;
    contentScrollIntoView.value = "";
    await nextTick();
    contentScrollIntoView.value = "discovery-tail";
  },
  { flush: "post" },
);

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
    () => perspective.fact,
    () => perspective.meaning,
    () => perspective.impact,
    () => perspective.request,
    selectedMode,
    () => JSON.stringify(editableExpression.value),
    () => JSON.stringify(clarificationTurns.value),
    clarificationAnswer,
    clarificationSkipped,
    discoveryStarted,
    discoveryQuestion,
    discoveryReady,
    () => JSON.stringify(discoveryUnderstanding.value),
    discoverySafetyDisposition,
    discoverySafetyMessage,
    () => JSON.stringify(expressionDiscovery.detachedDrafts.value),
  ],
  scheduleEditorDraftSave,
  { flush: "post" },
);

onUnmounted(() => {
  workspaceGeneration += 1;
  noticeController.dispose();
  if (recordingTimer) clearInterval(recordingTimer);
  if (aiPollTimer) clearTimeout(aiPollTimer);
  sharedUnderstanding.stop();
  flushEditorDraft();
});

onHide(() => {
  sharedUnderstanding.stop();
  flushEditorDraft();
});
onUnload(flushEditorDraft);

const totalSteps = 5;
const currentStep = computed(() => phaseByStage[stage.value].step);
const currentPhaseLabel = computed(() => phaseByStage[stage.value].label);
const progressPercent = computed(() => (currentStep.value / totalSteps) * 100);
const activeNvcCard = computed(() => nvcCardForStage(stage.value));
const activeNvcIndex = computed(() => activeNvcCard.value
  ? nvcPerspectiveCards.findIndex((card) => card.key === activeNvcCard.value?.key)
  : -1);
const showBottomBar = computed(() => {
  if (stage.value === "COMMON" && isV2Room.value) return false;
  if (stage.value === "DIALOGUE") return false;
  return ["GOAL", "MODE_SELECT", "EXPRESSION_REVIEW", "REVIEW", "COMMON"]
    .includes(stage.value) || Boolean(activeNvcCard.value);
});
const currentClarificationQuestion = computed(() => clarificationSkipped.value
  ? ""
  : nextClarificationQuestion(editableExpression.value.uncertainties, clarificationTurns.value));
const currentExpressionOption = computed(() => expressionModeOption(editableExpression.value.mode));
const expressionReviewIsSummary = computed(() => isExpressionReviewSummary(
  expressionReviewStep.value,
  currentExpressionOption.value.fields.length,
));
const currentExpressionField = computed(() => expressionReviewIsSummary.value
  ? null
  : currentExpressionOption.value.fields[expressionReviewStep.value]);
const canContinue = computed(() => {
  if (stage.value === "MODE_SELECT") return Boolean(selectedMode.value);
  if (stage.value === "EXPRESSION_REVIEW") {
    if (!expressionReviewIsSummary.value) {
      const field = currentExpressionField.value;
      if (!field) return false;
      if (editableExpression.value.mode === "BOUNDARY" && field.key === "reason") return true;
      return Boolean(editableExpression.value.fields[field.key]?.trim());
    }
    return expressionIsComplete(editableExpression.value) &&
      invitationDraftIsComplete(editableExpression.value.invitation) &&
      !["BLOCK_SHARE", "PAUSE"].includes(editableExpression.value.safetyDisposition);
  }
  if (activeNvcCard.value) return perspective[activeNvcCard.value.key].trim().length > 0;
  if (stage.value === "REVIEW") return Object.values(perspective).every((value) => value.trim().length > 0);
  if (stage.value === "COMMON") return agreementProposal.value.trim().length > 0;
  return true;
});
const nextLabel = computed(() => {
  if (stage.value === "MODE_SELECT") return selectedMode.value === "PAUSE" ? "确认暂停" : "请 AI 帮我整理";
  if (stage.value === "EXPRESSION_REVIEW") {
    if (expressionReviewIsSummary.value) return "确认表达卡和邀请说明";
    return "保存修改，返回表达卡";
  }
  if (activeNvcCard.value) {
    const nextStage = nextNvcStage(activeNvcCard.value.stage);
    const nextCard = nextStage ? nvcCardForStage(nextStage) : null;
    return nextCard ? `下一步：${nextCard.label}` : "查看四步总览";
  }
  if (stage.value === "REVIEW") return "确认并分享";
  if (stage.value === "COMMON") return "提出 7 天实验";
  return "继续";
});
const backLabel = computed(() => {
  if (stage.value !== "EXPRESSION_REVIEW") return "返回修改";
  if (!expressionReviewIsSummary.value) return "返回表达卡";
  return currentClarificationQuestion.value || optionalClarificationQuestion(clarificationTurns.value)
    ? "继续和 AI 说"
    : "修改表达卡";
});
const reviewDateLabel = computed(() => formatReviewDate(reviewAt.value));
const ownAccepted = computed(() => {
  const agreement = snapshot.value?.agreement;
  if (!agreement || !room.value) return false;
  return room.value.role === "A" ? agreement.accepted_a : agreement.accepted_b;
});
const accountPlatform = computed(() => accountPlatformSummary(__PLATFORM__, authEmail.value));
const isV2Room = computed(() => room.value?.workflowVersion === 2);
const accountMark = computed(() => accountPlatform.value.identity.slice(0, 1).toUpperCase() || "我");
const accountRoomPhase = computed(() => roomPhaseLabel(stage.value, room.value));
const accountRoomRole = computed(() => roomRoleLabel(room.value));
const accountDraftStatus = computed(() => draftStatusLabel(
  room.value,
  draftSaveState.value,
  Boolean(snapshot.value?.privateDraft),
));
const editorPrivacyNote = computed(() => {
  if (draftSaveState.value === "saving") return "正在把当前内容保存到此设备";
  if (draftSaveState.value === "saved") return "当前内容已保存在此设备的私人草稿中";
  return "开始输入后，内容会自动保存为此设备的私人草稿";
});
const resolvedInvitationContext = computed<InvitationContext>(() => {
  if (invitationContext.value) return invitationContext.value;
  const inviter = snapshot.value?.participants.find((item) => item.role === "A")?.display_name;
  return invitationContextFromEditableExpression(
    room.value?.role === "A" ? editableExpression.value : createEditableExpression("NVC"),
    !inviter || ["我", "Lin"].includes(inviter) ? "邀请你的人" : inviter,
  );
});
const currentInvitationClarificationMessage = computed(() => invitationClarificationMessage(
  resolvedInvitationContext.value,
  room.value?.code ?? "",
));
const invitationShareTitle = computed(() => resolvedInvitationContext.value.title
  ? `我想和你说开：${resolvedInvitationContext.value.title.slice(0, 22)}`
  : "我想和你把一件事说开");

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

function message(error: unknown, fallback: string) {
  return userFacingErrorMessage(error, fallback);
}

function isWorkspaceConflict(error: unknown) {
  return error instanceof ApiError && error.code === "WORKSPACE_CONFLICT";
}

function setNotice(kind: Notice["kind"], text: string) {
  noticeController.show(kind, text);
}

function clearNotice() {
  noticeController.clear();
}

async function loadProfile(openWhenMissing = true) {
  if (!authUserId.value) return;
  discardForeignProfileContextDrafts(authUserId.value);
  try {
    profile.value = await profileApi.get();
    profileDraft.value = getProfileDraft(authUserId.value);
    profileError.value = "";
    if (openWhenMissing && profile.value.status === "MISSING") profileOpen.value = true;
  } catch (error) {
    profileDraft.value = getProfileDraft(authUserId.value);
    profileError.value = message(error, "暂时无法读取个人资料，请检查网络后重试。");
    if (openWhenMissing) profileOpen.value = true;
  }
}

function openProfileEditor() {
  profileReturnToAccount.value = true;
  accountOpen.value = false;
  profileDraft.value = getProfileDraft(authUserId.value);
  profileError.value = "";
  profileOpen.value = true;
}

function persistProfileDraft(draft: ProfileDraft) {
  if (!authUserId.value) return;
  profileDraft.value = { ...draft };
  saveProfileDraft(authUserId.value, draft);
}

function closeProfileEditor(draft: ProfileDraft) {
  persistProfileDraft(draft);
  profileOpen.value = false;
  pendingProfileAction.value = null;
  restoreAccountProfileFocus();
}

function restoreAccountProfileFocus() {
  if (!profileReturnToAccount.value) return;
  profileReturnToAccount.value = false;
  accountOpen.value = true;
  void nextTick(() => nextTick(() => accountSpaceRef.value?.focusProfileEntry()));
}

async function saveProfile(draft: ProfileDraft) {
  if (!authUserId.value || profileBusy.value) return;
  profileBusy.value = true;
  profileError.value = "";
  try {
    profile.value = await profileApi.save(profile.value.revision, draft);
    clearProfileDraft(authUserId.value);
    profileDraft.value = null;
    profileOpen.value = false;
    restoreAccountProfileFocus();
    setNotice("success", "个人资料已保存。");
    const action = pendingProfileAction.value;
    pendingProfileAction.value = null;
    if (action === "CREATE") await createRoom();
    else if (action === "JOIN") await joinRoom();
  } catch (error) {
    if (isWorkspaceConflict(error)) {
      persistProfileDraft(draft);
      try {
        profile.value = await profileApi.get();
        profileError.value = "资料已在另一处更新。已重新读取账号版本；你刚才的输入仍保留，请确认后再次保存。";
      } catch {
        profileError.value = "资料已在另一处更新。你的输入仍保留；请联网后重新打开资料再保存。";
      }
    } else {
      profileError.value = message(error, "资料没有保存，请检查网络后重新保存。");
    }
  } finally {
    profileBusy.value = false;
  }
}

async function clearProfilePreferences() {
  if (profile.value.status !== "ACTIVE" || profileBusy.value) return;
  profileBusy.value = true;
  profileError.value = "";
  try {
    profile.value = await profileApi.clearPreferences(profile.value.revision);
    clearProfileDraft(authUserId.value);
    profileDraft.value = null;
    setNotice("success", "可选偏好已清空，称呼和历史沟通没有改变。");
  } catch (error) {
    if (isWorkspaceConflict(error)) {
      try {
        profile.value = await profileApi.get();
        profileError.value = "资料已在另一处更新。已重新读取账号版本；请再次确认要清空的内容。";
      } catch {
        profileError.value = "资料已在另一处更新。请联网后重新打开个人资料，再确认清空。";
      }
    } else {
      profileError.value = message(error, "没有清空，请重试。");
    }
  } finally {
    profileBusy.value = false;
  }
}

function persistRelationshipDraft(draft: RelationshipDraft) {
  if (!authUserId.value || !room.value) return;
  relationshipDraft.value = draft;
  saveRelationshipDraft(authUserId.value, room.value.roomId, room.value.role, draft);
}

async function routeRelationshipOnboarding(roomSession: RoomSession): Promise<ClientStage> {
  if (roomSession.workflowVersion !== 2 || ![
    "GOAL_SETTING", "B_DRAFTING", "B_REVIEWING",
  ].includes(roomSession.state)) return stageForCurrentRoom(roomSession);
  const context = await roomApi.relationshipContext(roomSession.roomId);
  relationshipContext.value = context;
  const stored = getRelationshipDraft(authUserId.value, roomSession.roomId, roomSession.role);
  relationshipDraft.value = stored &&
    stored.sharedRevision === context.shared.revision && stored.privateRevision === context.mine.revision
    ? stored : null;
  return relationshipOnboardingStage(
    roomSession,
    context,
    hasAcknowledgedInvitation(roomSession.roomId),
  ) ?? stageForCurrentRoom(roomSession);
}

async function saveRelationshipOnboarding(payload: {
  status: "CONFIRMED" | "DIFFERENT" | "SKIPPED";
  shared: SharedContextDraft;
  mine: ParticipantContextDraft;
}) {
  if (!room.value || !relationshipContext.value || busy.value) return;
  const currentRoom = room.value;
  const currentContext = relationshipContext.value;
  const currentUserId = authUserId.value;
  const outcome = await relationshipSubmitter.submit({
    role: currentRoom.role,
    invitationAcknowledged: hasAcknowledgedInvitation(currentRoom.roomId),
    isCurrent: () => authUserId.value === currentUserId &&
      room.value?.roomId === currentRoom.roomId && room.value.role === currentRoom.role,
    save: () => currentRoom.role === "A"
      ? roomApi.saveRelationshipContext(
        currentRoom.roomId,
        currentContext.shared.revision,
        currentContext.mine.revision,
        payload.status === "SKIPPED" ? "SKIPPED" : "CONFIRMED",
        4,
        payload.shared,
        payload.mine,
      )
      : roomApi.respondRelationshipContext(
        currentRoom.roomId,
        currentContext.mine.revision,
        currentContext.shared.revision,
        payload.status,
        4,
        payload.status,
        payload.mine,
      ),
    recoverError: async (error) => {
      if (isWorkspaceConflict(error)) {
        return recoverRelationshipConflict(currentRoom, currentUserId);
      }
      return "关系背景没有保存。请重新保存；如果仍然失败，请检查网络连接。刚才的输入仍保留。";
    },
  });
  if (outcome !== "saved") return;
  if (currentRoom.role === "A") {
    setNotice("success", payload.status === "SKIPPED" ? "已跳过关系背景，可以继续沟通。" : "关系背景已保存，接下来确认这次的意图。");
  } else {
    setNotice("success", "你的选择已保存。私人视角不会展示给邀请方。");
  }
}

async function saveRelationshipCheckpoint(payload: {
  step: number;
  decision: "CONFIRMED" | "DIFFERENT" | "SKIPPED" | null;
  shared: SharedContextDraft;
  mine: ParticipantContextDraft;
}) {
  if (!room.value || !relationshipContext.value || busy.value) return;
  busy.value = true;
  relationshipError.value = "";
  try {
    const latest = room.value.role === "A"
      ? await roomApi.saveRelationshipContext(
        room.value.roomId,
        relationshipContext.value.shared.revision,
        relationshipContext.value.mine.revision,
        "DRAFT",
        payload.step,
        payload.shared,
        payload.mine,
      )
      : await roomApi.respondRelationshipContext(
        room.value.roomId,
        relationshipContext.value.mine.revision,
        relationshipContext.value.shared.revision,
        "DRAFT",
        payload.step,
        payload.decision,
        payload.mine,
      );
    if (relationshipDraft.value) {
      relationshipDraft.value = {
        ...relationshipDraft.value,
        step: payload.step,
        ...(payload.decision ? { decision: payload.decision } : {}),
        sharedRevision: latest.shared.revision,
        privateRevision: latest.mine.revision,
      };
      saveRelationshipDraft(
        authUserId.value,
        room.value.roomId,
        room.value.role,
        relationshipDraft.value,
      );
    }
    relationshipContext.value = latest;
  } catch (error) {
    if (isWorkspaceConflict(error)) relationshipError.value = await recoverRelationshipConflict();
    else relationshipError.value = message(error, "草稿没有同步到其他设备，本机内容仍然保留。");
  } finally {
    busy.value = false;
  }
}

async function recoverRelationshipConflict(
  expectedRoom = room.value,
  expectedUserId = authUserId.value,
): Promise<string> {
  if (!expectedRoom) return "资料已在另一处更新。你的本机内容仍保留；请重新打开这间房再保存。";
  const local = relationshipDraft.value;
  try {
    const latest = await roomApi.relationshipContext(expectedRoom.roomId);
    if (authUserId.value !== expectedUserId ||
      room.value?.roomId !== expectedRoom.roomId || room.value.role !== expectedRoom.role) return "";
    relationshipContext.value = latest;
    if (local) {
      relationshipDraft.value = rebaseRelationshipDraft(local, latest);
      saveRelationshipDraft(
        expectedUserId,
        expectedRoom.roomId,
        expectedRoom.role,
        relationshipDraft.value,
      );
    }
    return "资料已在另一处更新。已重新读取服务端版本；你的本机内容仍保留，请确认后再次保存。";
  } catch {
    if (authUserId.value !== expectedUserId ||
      room.value?.roomId !== expectedRoom.roomId || room.value.role !== expectedRoom.role) return "";
    return "资料已在另一处更新。你的本机内容仍保留；请联网后重新打开这间房再保存。";
  }
}

function updateRoom(nextRoom: RoomSession) {
  room.value = nextRoom;
  saveActiveRoom(nextRoom, authUserId.value || undefined);
}

function resetClarification(skipped = false) {
  clarificationTurns.value = [];
  clarificationAnswer.value = "";
  clarificationSkipped.value = skipped;
}

function openExpressionReview(showSummary = true) {
  if (showSummary && !editableExpression.value.invitation.title.trim() &&
    !editableExpression.value.invitation.summary.trim()) {
    editableExpression.value = {
      ...editableExpression.value,
      invitation: invitationDraftFromExpression(editableExpression.value),
    };
  }
  expressionReviewStep.value = showSummary
    ? expressionReviewSummaryStep(currentExpressionOption.value.fields.length)
    : 0;
  stage.value = "EXPRESSION_REVIEW";
}

function addOptionalClarificationQuestion() {
  const question = optionalClarificationQuestion(clarificationTurns.value);
  if (!question) return "";
  editableExpression.value = {
    ...editableExpression.value,
    uncertainties: [question],
  };
  return question;
}

function openExpressionCandidate() {
  let question = expressionCandidateClarificationQuestion(
    editableExpression.value.uncertainties,
    clarificationTurns.value,
    editableExpression.value,
    expressionFieldProgress(editableExpression.value),
  );
  if (question && !currentClarificationQuestion.value) {
    editableExpression.value = { ...editableExpression.value, uncertainties: [question] };
  }
  if (!question) {
    question = optionalClarificationQuestion(clarificationTurns.value);
    if (question) editableExpression.value = { ...editableExpression.value, uncertainties: [question] };
  }
  clarificationSkipped.value = false;
  stage.value = "CLARIFICATION_CHAT";
}

function resetPrivateWorkspace() {
  workspaceGeneration += 1;
  invitationContextRequest += 1;
  if (recording.value) stopRecording();
  recording.value = false;
  if (editorSaveTimer) clearTimeout(editorSaveTimer);
  editorSaveTimer = null;
  room.value = null;
  snapshot.value = null;
  transcript.value = "";
  agreementProposal.value = "";
  Object.assign(perspective, createNvcPerspective());
  selectedMode.value = null;
  editableExpression.value = createEditableExpression("NVC");
  workspaceRevision.value = 0;
  aiJobId.value = "";
  expressionOrganizationFailure.value = "";
  expressionUpdatedFieldKeys.value = [];
  expressionReviewStep.value = 0;
  resetClarification();
  expressionDiscovery.reset();
  invitationContext.value = null;
  invitationContextStatus.value = "idle";
  invitationClarifying.value = false;
  sharedUnderstanding.reset();
  dialogueState.value = null;
  historyReadOnly.value = false;
  aiConversationArchiveReadOnly.value = false;
  relationshipContext.value = null;
  relationshipDraft.value = null;
  relationshipError.value = "";
  if (aiPollTimer) clearTimeout(aiPollTimer);
  aiPollTimer = null;
  reviewAt.value = defaultReviewAt();
  draftSaveState.value = "empty";
}

function isEditorStage(value: ClientStage) {
  return isEditorClientStage(value);
}

function roomIsDrafting(roomSession: RoomSession) {
  return roomSession.state === (roomSession.role === "A" ? "A_DRAFTING" : "B_DRAFTING");
}

function flushEditorDraft() {
  if (editorSaveTimer) clearTimeout(editorSaveTimer);
  editorSaveTimer = null;
  if (!room.value || !isEditorStage(stage.value)) return;
  saveEditorDraft({
    roomId: room.value.roomId,
    role: room.value.role,
    transcript: transcript.value,
    clarification: perspective.meaning,
    perspective: { ...perspective },
    editorStage: stage.value,
    selectedMode: selectedMode.value,
    editableExpression: editableExpression.value,
    workspaceRevision: workspaceRevision.value,
    aiJobId: aiJobId.value,
    clarificationTurns: clarificationTurns.value,
    clarificationAnswer: clarificationAnswer.value,
    clarificationSkipped: clarificationSkipped.value,
    discoveryStarted: discoveryStarted.value,
    discoveryConversationRevision: expressionDiscovery.conversationRevision.value,
    detachedDiscoveryDrafts: expressionDiscovery.detachedDrafts.value,
    discoveryQuestion: discoveryQuestion.value,
    discoveryReady: discoveryReady.value,
    discoveryModeSelectionOpen: discoveryModeSelectionOpen.value,
    discoveryUnderstanding: discoveryUnderstanding.value ?? undefined,
    discoverySafetyDisposition: discoverySafetyDisposition.value,
    discoverySafetyMessage: discoverySafetyMessage.value,
  });
  draftSaveState.value = "saved";
}

function scheduleEditorDraftSave() {
  if (editorSaveTimer) clearTimeout(editorSaveTimer);
  if (room.value && isEditorStage(stage.value)) draftSaveState.value = "saving";
  editorSaveTimer = setTimeout(flushEditorDraft, 250);
}

function restoreEditorDraft(roomSession: RoomSession, minimumWorkspaceRevision = 0) {
  if (!isEditorStage(stage.value)) return;
  const draft = getEditorDraft(roomSession.roomId, roomSession.role);
  if (!draft) return;
  if ((draft.workspaceRevision ?? 0) < minimumWorkspaceRevision) return;
  transcript.value = draft.transcript;
  Object.assign(perspective, draft.perspective);
  if (draft.selectedMode !== undefined) selectedMode.value = draft.selectedMode;
  if (draft.editableExpression) editableExpression.value = draft.editableExpression;
  if (draft.workspaceRevision !== undefined) workspaceRevision.value = draft.workspaceRevision;
  if (draft.aiJobId) aiJobId.value = draft.aiJobId;
  if (draft.clarificationTurns) clarificationTurns.value = draft.clarificationTurns;
  if (draft.clarificationAnswer !== undefined) clarificationAnswer.value = draft.clarificationAnswer;
  if (draft.clarificationSkipped !== undefined) clarificationSkipped.value = draft.clarificationSkipped;
  if (draft.discoveryStarted !== undefined) discoveryStarted.value = draft.discoveryStarted;
  if (draft.discoveryConversationRevision !== undefined) {
    expressionDiscovery.conversationRevision.value = draft.discoveryConversationRevision;
  }
  if (draft.detachedDiscoveryDrafts !== undefined) {
    expressionDiscovery.detachedDrafts.value = draft.detachedDiscoveryDrafts;
  }
  if (draft.discoveryQuestion !== undefined) discoveryQuestion.value = draft.discoveryQuestion;
  if (draft.discoveryReady !== undefined) discoveryReady.value = draft.discoveryReady;
  if (draft.discoveryModeSelectionOpen !== undefined) {
    discoveryModeSelectionOpen.value = draft.discoveryModeSelectionOpen;
  }
  if (draft.discoveryUnderstanding !== undefined) {
    discoveryUnderstanding.value = draft.discoveryUnderstanding;
  }
  if (draft.discoverySafetyDisposition !== undefined) {
    discoverySafetyDisposition.value = draft.discoverySafetyDisposition;
  }
  if (draft.discoverySafetyMessage !== undefined) discoverySafetyMessage.value = draft.discoverySafetyMessage;
  if (draft.editorStage && roomIsDrafting(roomSession)) {
    stage.value = ["AI_PENDING", "EXPRESSION_REVIEW"].includes(draft.editorStage)
      ? "CLARIFICATION_CHAT"
      : draft.editorStage;
  }
  draftSaveState.value = "saved";
  if (draft.aiJobId && ["AI_PENDING", "CLARIFICATION_CHAT", "EXPRESSION_REVIEW"].includes(draft.editorStage ?? "")) {
    busy.value = true;
    void pollExpressionJob(draft.aiJobId);
  }
}

function applySnapshot(latest: RoomSnapshot) {
  snapshot.value = latest;
  if (latest.invitationContext) {
    invitationContext.value = latest.invitationContext;
    invitationContextStatus.value = "ready";
  }
  if (!room.value) return;
  updateRoom({ ...room.value, code: latest.room.code, state: latest.room.state });
  if (latest.room.goal) goal.value = latest.room.goal;
  if (latest.privateDraft) {
    transcript.value = latest.privateDraft.transcript;
  }
  if (latest.ownPerspective) {
    Object.assign(perspective, latest.ownPerspective);
  } else if (
    latest.privateDraft &&
    (latest.room.state === "A_REVIEWING" || latest.room.state === "B_REVIEWING")
  ) {
    Object.assign(
      perspective,
      createNvcPerspective(latest.privateDraft.clarification ?? ""),
    );
  }
  if (latest.agreement) agreementProposal.value = latest.agreement.proposal;
}

async function loadSnapshot(roomSession: RoomSession, prefetched?: RoomSnapshot) {
  historyReadOnly.value = false;
  const latest = prefetched ?? await roomApi.snapshot(roomSession.roomId);
  applySnapshot(latest);
  const currentSession = { ...roomSession, state: latest.room.state };
  stage.value = await routeRelationshipOnboarding(currentSession);
  if (!latest.invitationContext && !invitationContext.value &&
    ((roomSession.role === "B" && ["B_DRAFTING", "B_REVIEWING"].includes(latest.room.state)) ||
      (roomSession.role === "A" && stage.value === "INVITE"))) invitationContextStatus.value = "error";
  if (roomSession.workflowVersion === 2 && latest.room.state === "COMMON_VIEW_READY") {
    if (["UNDERSTANDING_GENERATING", "UNDERSTANDING_CONFIRMING", "ACTION_GENERATING", "ACTION_CONFIRMING"]
      .includes(roomSession.phaseV2 ?? "")) {
      stage.value = "AI_PENDING";
      await pollUnderstanding();
    } else {
      try {
        dialogueState.value = await roomApi.dialogueState(roomSession.roomId);
      } catch {
        dialogueState.value = await roomApi.startDialogue(roomSession.roomId);
      }
      updateRoom({ ...roomSession, state: latest.room.state, phaseV2: "DIALOGUE" });
      stage.value = "DIALOGUE";
    }
  }
  if (roomSession.workflowVersion === 2 &&
    (latest.room.state === "COMPLETED" || ["COMPLETED", "ENDED"].includes(roomSession.phaseV2 ?? ""))) {
    try {
      dialogueState.value = await roomApi.dialogueState(roomSession.roomId);
    } catch {
      dialogueState.value = null;
    }
  }
  let authoritativeEditorStage: ClientStage | null = null;
  let minimumWorkspaceRevision = 0;
  if (roomSession.workflowVersion === 2 && ["A_DRAFTING", "B_DRAFTING", "A_REVIEWING", "B_REVIEWING"].includes(latest.room.state)) {
    const workspace = await roomApi.expressionWorkspace(roomSession.roomId);
    minimumWorkspaceRevision = workspace.revision;
    workspaceRevision.value = workspace.revision;
    if (workspace.sourceText) {
      const privateSource = parseClarificationSource(workspace.sourceText);
      transcript.value = privateSource.sourceText;
      clarificationTurns.value = privateSource.turns;
    }
    selectedMode.value = workspace.selectedMode;
    if (workspace.flowState === "PAUSED") authoritativeEditorStage = "PAUSED";
    else if (workspace.selectedMode && workspace.selectedMode !== "PAUSE" && workspace.aiCandidate) {
      editableExpression.value = parseAiExpressionCandidate(workspace.aiCandidate, workspace.selectedMode);
      authoritativeEditorStage = "CLARIFICATION_CHAT";
    }
  }
  if (stage.value !== "INVITATION_INTRO") restoreEditorDraft(roomSession, minimumWorkspaceRevision);
  if (stage.value === "RECORD" && roomIsDrafting(roomSession)) {
    try {
      const restoredConversation = await roomApi.aiConversation(roomSession.roomId);
      if (restoredConversation.revision > expressionDiscovery.conversationRevision.value) {
        expressionDiscovery.restore(restoredConversation);
      }
    } catch {
      setNotice("error", "暂时无法读取上次的私人对话。本机内容仍在，请检查网络后重新读取。 ");
    }
  }
  if (stage.value !== "INVITATION_INTRO") {
    if (authoritativeEditorStage === "PAUSED") stage.value = authoritativeEditorStage;
    else if (authoritativeEditorStage) openExpressionCandidate();
  }
}

function stageForCurrentRoom(roomSession: RoomSession, state = roomSession.state): ClientStage {
  if (roomSession.workflowVersion !== 2) return stageForRoom(roomSession.role, state);
  if (roomSession.phaseV2 === "PAUSED") return "PAUSED";
  if (roomSession.phaseV2 === "ENDED") return "COMPLETE";
  if (state === "COMPLETED") return "COMPLETE";
  if (state === "AGREEMENT_PENDING") return "AGREEMENT";
  if (roomSession.phaseV2 === "UNDERSTANDING_GENERATING") return "AI_PENDING";
  if (["UNDERSTANDING_CONFIRMING", "ACTION_GENERATING", "ACTION_CONFIRMING"]
    .includes(roomSession.phaseV2 ?? "")) return "COMMON";
  if (roomSession.phaseV2 === "DIALOGUE" || state === "COMMON_VIEW_READY") return "DIALOGUE";
  if (roomSession.role === "A") {
    if (state === "GOAL_SETTING") return "GOAL";
    if (state === "A_DRAFTING" || state === "A_REVIEWING") return "RECORD";
    return "INVITE";
  }
  if (state === "B_DRAFTING" || state === "B_REVIEWING") {
    return hasAcknowledgedInvitation(roomSession.roomId) ? "RECORD" : "INVITATION_INTRO";
  }
  return "WELCOME";
}

async function restoreSavedRoom() {
  const savedRoom = getActiveRoom(authUserId.value || undefined);
  if (!savedRoom) return;
  busy.value = true;
  room.value = savedRoom;
  stage.value = stageForCurrentRoom(savedRoom);
  try {
    await loadSnapshot(savedRoom);
    setNotice("success", "已恢复上次的沟通进度。");
  } catch {
    restoreEditorDraft(savedRoom);
    setNotice("error", "暂时无法同步最新进展，房间信息已保留，可以稍后重试。 ");
  } finally {
    busy.value = Boolean(aiJobId.value);
  }
}

async function initializePage(options: Record<string, unknown> | undefined) {
  const incomingRoom = typeof options?.room === "string"
    ? options.room.replace(/[^a-z0-9]/gi, "").slice(0, 7).toUpperCase()
    : "";
  if (incomingRoom) joinCode.value = incomingRoom;

  if (isLiveH5) {
    busy.value = true;
    try {
      const restored = await restoreH5Auth();
      authUserId.value = restored.session?.userId ?? "";
      authEmail.value = restored.email;
    } catch (error) {
      setNotice("error", message(error, "无法恢复登录状态，请重新登录。"));
    } finally {
      busy.value = false;
    }
    if (!authUserId.value) return;
  } else {
    busy.value = true;
    try {
      const session = await loginForPlatform();
      authUserId.value = session.userId;
    } catch (error) {
      setNotice("error", message(error, "当前平台登录失败，请稍后重试。"));
      return;
    } finally {
      busy.value = false;
    }
  }

  await loadProfile(true);
  if (incomingRoom) return;
  await restoreSavedRoom();
}

onLoad((options) => {
  void initializePage(options);
});

onShareAppMessage(() => ({
  title: invitationShareTitle.value,
  path: `/pages/index/index?room=${room.value?.code ?? ""}`,
}));

function normalizeJoinCode(event: Event) {
  const value = (event as unknown as { detail: { value: string } }).detail.value;
  joinCode.value = value.replace(/[^a-z0-9]/gi, "").slice(0, 7).toUpperCase();
}

async function createRoom() {
  if (profile.value.status !== "ACTIVE") {
    pendingProfileAction.value = "CREATE";
    profileDraft.value = getProfileDraft(authUserId.value) ?? emptyProfileDraft();
    profileOpen.value = true;
    return;
  }
  clearNotice();
  busy.value = true;
  try {
    const session = await loginForPlatform();
    authUserId.value = session.userId;
    const outcome = await runCommittedRoomEntry(
      () => roomApi.create(profile.value.displayName),
      (created) => {
        resetPrivateWorkspace();
        updateRoom(created);
        stage.value = "WELCOME";
      },
      routeRelationshipOnboarding,
    );
    if (outcome.followup) stage.value = outcome.followup;
    if (outcome.rememberError) {
      setNotice("info", "房间已经在服务器创建，但本机入口没有保存成功。当前可以继续；请不要重复创建，重新登录后可从历史沟通找回。");
    } else if (outcome.followupError) {
      setNotice("info", "房间已经创建并保存在“继续上次的沟通”中，但关系背景暂时没有读取成功。请从首页继续，不要重复创建。");
    } else {
      setNotice("success", "私人沟通空间已创建。先补充一点关系背景，也可以全部跳过。 ");
    }
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
  if (profile.value.status !== "ACTIVE") {
    pendingProfileAction.value = "JOIN";
    profileDraft.value = getProfileDraft(authUserId.value) ?? emptyProfileDraft();
    profileOpen.value = true;
    return;
  }
  clearNotice();
  busy.value = true;
  try {
    const session = await loginForPlatform();
    authUserId.value = session.userId;
    const outcome = await runCommittedRoomEntry(
      () => roomApi.join(joinCode.value, profile.value.displayName),
      (joined) => {
        resetPrivateWorkspace();
        updateRoom(joined);
        if (joined.invitationContext) {
          invitationContext.value = joined.invitationContext;
          invitationContextStatus.value = "ready";
        }
        stage.value = "WELCOME";
      },
      async (joined) => {
        const joinedStage = await routeRelationshipOnboarding(joined);
        if (shouldLoadSnapshotAfterJoin(joinedStage)) {
          await loadSnapshot(joined);
        } else {
          stage.value = joinedStage;
          if (joinedStage === "INVITATION_INTRO" && !joined.invitationContext) invitationContextStatus.value = "error";
        }
        return joinedStage;
      },
    );
    if (outcome.rememberError) {
      setNotice("info", "你已经在服务器加入房间，但本机入口没有保存成功。当前可以继续；请不要重复加入，重新登录后可从历史沟通找回。");
    } else if (outcome.followupError) {
      setNotice("info", "你已经加入房间并保存在“继续上次的沟通”中，但后续内容暂时没有读取成功。请从首页继续，不要重复加入。");
    } else {
      setNotice("success", outcome.followup === "INVITATION_INTRO"
        ? "已进入沟通房间。先看看对方为什么邀请你。 "
        : "已进入沟通房间。你的草稿不会直接分享给对方。 ");
    }
  } catch (error) {
    setNotice("error", message(error, "加入失败，请检查房间码后重试。"));
  } finally {
    busy.value = false;
  }
}

async function handleH5Authenticated(result: H5AuthResult) {
  if (!result.session) return;
  resetRoomHistory();
  authUserId.value = result.session.userId;
  authEmail.value = result.email;
  setNotice("success", "登录成功。");
  await loadProfile(true);
  await restoreSavedRoom();
}

function openAccountSpace() {
  flushEditorDraft();
  accountOpen.value = true;
  void loadRoomHistory(true);
  void loadAiArchive();
}

async function loadAiArchive() {
  if (!authUserId.value || aiArchiveLoading.value) return;
  aiArchiveLoading.value = true;
  aiArchiveError.value = "";
  try {
    const [conversations, memories] = await Promise.all([
      roomApi.aiConversationHistory(),
      roomApi.aiMemories(),
    ]);
    aiConversationHistory.value = conversations;
    aiMemories.value = memories;
  } catch (error) {
    aiArchiveError.value = message(error, "暂时无法读取 AI 私人档案，请检查网络后重试。");
  } finally {
    aiArchiveLoading.value = false;
  }
}

async function openAiConversationHistory(item: AiConversationHistoryItem) {
  const target: RoomSession = {
    roomId: item.roomId,
    code: item.roomCode,
    role: item.role,
    state: item.state,
    workflowVersion: 2,
    ...(item.phaseV2 ? { phaseV2: item.phaseV2 } : {}),
  };
  accountOpen.value = false;
  flushEditorDraft();
  resetPrivateWorkspace();
  updateRoom(target);
  busy.value = true;
  try {
    await loadSnapshot(target);
    if (!room.value || !roomIsDrafting(room.value)) {
      const conversation = await roomApi.aiConversation(target.roomId);
      if (!expressionDiscovery.restore(conversation)) {
        throw new Error("这次私人对话暂时没有可恢复的内容。");
      }
      aiConversationArchiveReadOnly.value = true;
      stage.value = "RECORD";
    }
    setNotice("success", "已恢复上次与 AI 的私人对话。只有你能看到。 ");
  } catch (error) {
    stage.value = stageForCurrentRoom(target);
    restoreEditorDraft(target);
    setNotice("error", message(error, "暂时无法打开这次私人对话，本机内容仍会保留。"));
  } finally {
    busy.value = Boolean(aiJobId.value);
  }
}

async function decidePersonalMemory(
  item: PersonalMemoryItem,
  decision: "CONFIRM" | "REJECT" | "FORGET",
  content?: string,
) {
  if (busy.value) return;
  busy.value = true;
  clearNotice();
  try {
    await roomApi.decideAiMemory(item.id, decision, content);
    discoveryMemoryProposals.value = discoveryMemoryProposals.value.filter((candidate) => candidate.id !== item.id);
    await loadAiArchive();
    setNotice("success", decision === "CONFIRM"
      ? "已记住。以后只会在与你相关的私人对话中参考。 "
      : decision === "FORGET"
        ? "已停止记住，来源房间的历史对话仍会保留。 "
        : "这条内容只用于本次沟通，不会成为长期记忆。 ");
  } catch (error) {
    setNotice("error", message(error, "记忆状态没有更新，请稍后重试。"));
  } finally {
    busy.value = false;
  }
}

async function decideRelationshipMemory(
  item: RelationshipMemoryItem,
  decision: "REMEMBER" | "DECLINE" | "STOP",
) {
  if (busy.value) return;
  busy.value = true;
  clearNotice();
  try {
    await roomApi.decideRelationshipMemory(item.id, decision);
    await loadAiArchive();
    setNotice("success", decision === "REMEMBER"
      ? "已记录你的选择。只有对方也同意后，AI 才会共同记住。 "
      : decision === "STOP"
        ? "已停止共同记住，AI 不会再使用这条内容。 "
        : "这条共同理解不会成为长期记忆。 ");
  } catch (error) {
    setNotice("error", message(error, "共同记忆状态没有更新，请稍后重试。"));
  } finally {
    busy.value = false;
  }
}

function confirmForgetPersonalMemory(item: PersonalMemoryItem) {
  uni.showModal({
    title: "停止记住这条内容？",
    content: "停止记住后，AI 不会再在以后对话中使用这条内容；来源房间的历史对话仍会保留。",
    confirmText: "停止记住",
    confirmColor: "#a23d2b",
    cancelText: "继续保留",
    success: ({ confirm }) => {
      if (confirm) void decidePersonalMemory(item, "FORGET");
    },
  });
}

function editPersonalMemory(item: PersonalMemoryItem) {
  uni.showModal({
    title: "修改后记住",
    content: item.content,
    editable: true,
    placeholderText: "写成你希望 AI 以后参考的说法",
    confirmText: "保存这条记忆",
    cancelText: "暂不修改",
    success: ({ confirm, content }) => {
      const edited = content?.trim();
      if (!confirm) return;
      if (!edited) {
        setNotice("error", "记忆内容不能为空，请重新填写。 ");
        return;
      }
      void decidePersonalMemory(item, "CONFIRM", edited);
    },
  });
}

function confirmDiscardDetachedDraft(index: number) {
  uni.showModal({
    title: "丢弃这段未发送草稿？",
    content: "这段文字还没有发给 AI。丢弃后无法恢复；你也可以先放回输入框再修改。",
    confirmText: "确认丢弃",
    confirmColor: "#a23d2b",
    cancelText: "继续保留",
    success: ({ confirm }) => {
      if (confirm) expressionDiscovery.discardDetachedDraft(index);
    },
  });
}

async function openHistoricalRoom(item: RoomHistoryItem) {
  if (busy.value) return;
  clearNotice();
  busy.value = true;
  let target: RoomSession | null = null;
  try {
    const wasCurrent = item.roomId === room.value?.roomId;
    target = roomSessionFromHistory(item);
    const latest = await roomApi.snapshot(target.roomId);
    flushEditorDraft();
    resetPrivateWorkspace();
    updateRoom(target);
    await loadSnapshot(target, latest);
    accountOpen.value = false;
    setNotice("success", wasCurrent
      ? "已回到这次沟通的最新进度。"
      : "已打开历史沟通。");
  } catch (error) {
    if (target && room.value?.roomId === target.roomId) stage.value = stageForCurrentRoom(target);
    setNotice("error", message(error, "暂时无法打开这次历史沟通。"));
  } finally {
    busy.value = false;
  }
}

function confirmLogoutImpact() {
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "退出当前设备？",
      content: "退出后，这台设备保存的当前房间入口与未分享的私人草稿会被清除；其他设备不会退出。",
      confirmText: "确认退出",
      confirmColor: "#be442e",
      cancelText: "继续使用",
      success: ({ confirm }) => resolve(confirm),
      fail: () => resolve(false),
    });
  });
}

async function requestH5Logout() {
  if (!await confirmLogoutImpact()) return;
  await logoutH5Account();
}

async function logoutH5Account() {
  if (!isLiveH5 || !authUserId.value) return;
  clearNotice();
  busy.value = true;
  try {
    const signingOutUserId = authUserId.value;
    await signOutH5();
    clearPrivateDeviceData();
    clearProfileContextDraftsForUser(signingOutUserId);
    resetPrivateWorkspace();
    authUserId.value = "";
    authEmail.value = "";
    profile.value = {
      status: "MISSING", displayName: "", responseLength: null, language: null,
      useResponseLengthAi: true, useLanguageAi: true, revision: 0, consentRevision: 0, updatedAt: null,
    };
    profileOpen.value = false;
    resetRoomHistory();
    aiConversationHistory.value = [];
    aiMemories.value = { personal: [], relationship: [] };
    aiArchiveError.value = "";
    accountOpen.value = false;
    stage.value = "WELCOME";
    setNotice("success", "已退出，并清除本机保存的房间与私人草稿。");
  } catch (error) {
    setNotice("error", message(error, "退出失败，请稍后重试。"));
  } finally {
    busy.value = false;
  }
}

async function toggleRecording() {
  clearNotice();
  try {
    if (!recording.value) {
      recordingTarget = stage.value === "RECORD" && discoveryStarted.value ? "answer" : "transcript";
      const { completion } = await startRecording();
      const generation = workspaceGeneration;
      recording.value = true;
      void completion
        .then(async (audio) => {
          if (generation !== workspaceGeneration) return;
          recording.value = false;
          busy.value = true;
          const text = await transcribeAudio(audio);
          if (generation !== workspaceGeneration) return;
          expressionDiscovery.appendTranscription(recordingTarget, text);
          setNotice("success", "转写完成，你可以继续修改文字。 ");
        })
        .catch((error) => {
          if (generation !== workspaceGeneration) return;
          recording.value = false;
          setNotice("error", message(error, "录音失败，请改用文字输入。"));
        })
        .finally(() => {
          if (generation === workspaceGeneration) busy.value = false;
        });
      return;
    }
    stopRecording();
  } catch (error) {
    recording.value = false;
    setNotice("error", message(error, "录音失败，请改用文字输入。"));
  }
}

function updateExpressionField(key: string, value: string) {
  editableExpression.value = expressionAfterFieldEdit(editableExpression.value, key, value);
}

function updateInvitationDraft(key: "title" | "summary", value: string) {
  const next = { ...editableExpression.value.invitation, [key]: value };
  editableExpression.value = {
    ...editableExpression.value,
    invitation: {
      ...next,
      ready: invitationDraftIsComplete({ ...next, ready: true }),
    },
    userEditedInvitationFields: [
      ...new Set([...editableExpression.value.userEditedInvitationFields, key]),
    ],
  };
}

function changeExpressionMode() {
  stopExpressionJobPolling();
  expressionOrganizationFailure.value = "";
  expressionUpdatedFieldKeys.value = [];
  expressionReviewStep.value = 0;
  selectedMode.value = null;
  stage.value = "MODE_SELECT";
}

async function chooseExpressionMode(mode: ExpressionMode) {
  if (!room.value || busy.value) return;
  clearNotice();
  selectedMode.value = mode;
  if (mode === "PAUSE") {
    if (!await confirmPause()) {
      selectedMode.value = null;
      return;
    }
    busy.value = true;
    try {
      await roomApi.pause(room.value.roomId);
      updateRoom({ ...room.value, phaseV2: "PAUSED" });
      stage.value = "PAUSED";
      clearEditorDraft(room.value.roomId, room.value.role);
      draftSaveState.value = "empty";
      setNotice("success", "这次沟通已暂停，私人原话没有分享。 ");
    } catch (error) {
      selectedMode.value = null;
      setNotice("error", message(error, "暂时无法暂停，请检查网络后重试。"));
    } finally {
      busy.value = false;
    }
    return;
  }

  busy.value = true;
  try {
    editableExpression.value = createEditableExpression(mode);
    const privateSource = composeClarificationSource(transcript.value, clarificationTurns.value);
    const job = await requestExpressionOrganization(
      room.value.roomId,
      workspaceRevision.value,
      privateSource,
      mode,
      editableExpression.value,
    );
    workspaceRevision.value = job.revision;
    aiJobId.value = job.jobId;
    expressionOrganizationFailure.value = "";
    expressionUpdatedFieldKeys.value = [];
    stage.value = "CLARIFICATION_CHAT";
    void pollExpressionJob(job.jobId);
  } catch (error) {
    selectedMode.value = null;
    setNotice("error", message(error, "没有开始整理。请检查网络后重新选择，刚才的对话仍然保留。"));
  } finally {
    if (!aiJobId.value) busy.value = false;
  }
}

function stopExpressionJobPolling() {
  if (aiPollTimer) clearTimeout(aiPollTimer);
  aiPollTimer = null;
  aiJobId.value = "";
}

function stopWaitingForExpression() {
  if (!selectedMode.value || selectedMode.value === "PAUSE") return;
  stopExpressionJobPolling();
  expressionOrganizationFailure.value = shouldPreserveDraftOnAiExit(
    editableExpression.value.fields,
    clarificationTurns.value,
  )
    ? "已停止等待。上一版卡片和你的补充都已保留。"
    : "已停止等待。你可以直接在对话内填写卡片，或重新让 AI 整理。";
  stage.value = "CLARIFICATION_CHAT";
  busy.value = false;
}

function recoverExpressionJobFailure(text: string) {
  stopExpressionJobPolling();
  expressionOrganizationFailure.value = shouldPreserveDraftOnAiExit(
    editableExpression.value.fields,
    clarificationTurns.value,
  )
    ? `${text} 上一版卡片和你的补充都已保留。`
    : `${text} 原话仍在，你可以重新整理或直接修改对话内卡片。`;
  stage.value = "CLARIFICATION_CHAT";
  busy.value = false;
}

async function beginManualExpression() {
  if (!room.value || !selectedMode.value || selectedMode.value === "PAUSE" || busy.value) return;
  clearNotice();
  busy.value = true;
  try {
    const empty = createEditableExpression(selectedMode.value);
    const saved = await roomApi.saveExpressionWorkspace(
      room.value.roomId,
      workspaceRevision.value,
      transcript.value.trim(),
      selectedMode.value,
      empty.fields,
    );
    workspaceRevision.value = saved.revision;
    editableExpression.value = empty;
    clarificationAnswer.value = "";
    clarificationSkipped.value = false;
    editableExpression.value = {
      ...editableExpression.value,
      uncertainties: ["你想先从表达卡的哪一部分开始补充？"],
    };
    expressionOrganizationFailure.value = "";
    stage.value = "CLARIFICATION_CHAT";
    setNotice("info", "已打开对话内表达卡；你可以直接修改，也可以继续告诉 AI。 ");
  } catch (error) {
    setNotice("error", message(error, "私人草稿没有保存，请稍后重试。"));
  } finally {
    busy.value = false;
  }
}

async function continueClarification() {
  if (!room.value || !selectedMode.value || selectedMode.value === "PAUSE" || busy.value) return;
  const question = currentClarificationQuestion.value;
  const answer = clarificationAnswer.value.trim();
  if (!question || !answer) return;
  clearNotice();
  busy.value = true;
  const previousTurns = clarificationTurns.value;
  const nextTurns = [...previousTurns, { question, answer }];
  clarificationTurns.value = nextTurns;
  clarificationAnswer.value = "";
  try {
    expressionOrganizationFailure.value = "";
    const privateSource = composeClarificationSource(transcript.value, nextTurns);
    const job = await requestExpressionOrganization(
      room.value.roomId,
      workspaceRevision.value,
      privateSource,
      selectedMode.value,
      editableExpression.value,
    );
    clarificationSkipped.value = false;
    workspaceRevision.value = job.revision;
    aiJobId.value = job.jobId;
    void pollExpressionJob(job.jobId);
  } catch (error) {
    clarificationTurns.value = previousTurns;
    clarificationAnswer.value = answer;
    setNotice("error", message(error, "这次补充没有保存。请检查网络后再次发送，刚才的回答仍然保留。"));
  } finally {
    if (!aiJobId.value) busy.value = false;
  }
}

async function retryExpressionOrganization() {
  if (!room.value || !selectedMode.value || selectedMode.value === "PAUSE" || busy.value) return;
  clearNotice();
  busy.value = true;
  expressionOrganizationFailure.value = "";
  try {
    const privateSource = composeClarificationSource(transcript.value, clarificationTurns.value);
    const job = await requestExpressionOrganization(
      room.value.roomId,
      workspaceRevision.value,
      privateSource,
      selectedMode.value,
      editableExpression.value,
    );
    workspaceRevision.value = job.revision;
    aiJobId.value = job.jobId;
    stage.value = "CLARIFICATION_CHAT";
    void pollExpressionJob(job.jobId);
  } catch (error) {
    recoverExpressionJobFailure(message(error, "AI 整理任务暂时没有创建。"));
  } finally {
    if (!aiJobId.value) busy.value = false;
  }
}

async function confirmExpressionWorkspace() {
  if (!room.value || busy.value || !expressionIsComplete(editableExpression.value) ||
    !invitationDraftIsComplete(editableExpression.value.invitation) ||
    ["BLOCK_SHARE", "PAUSE"].includes(editableExpression.value.safetyDisposition)) return;
  clearNotice();
  busy.value = true;
  try {
    const confirmed = await roomApi.confirmExpression(
      room.value.roomId,
      workspaceRevision.value,
      expressionSharePayload(editableExpression.value),
      editableExpression.value.invitation.title,
      editableExpression.value.invitation.summary,
    );
    clearEditorDraft(room.value.roomId, room.value.role);
    aiJobId.value = "";
    expressionOrganizationFailure.value = "";
    draftSaveState.value = "empty";
    updateRoom({ ...room.value, state: confirmed.state });
    if (room.value.role === "B") {
      dialogueState.value = await roomApi.startDialogue(room.value.roomId);
      updateRoom({ ...room.value, phaseV2: "DIALOGUE" });
      stage.value = "DIALOGUE";
      setNotice("success", "这张表达卡已由你确认。先互相确认听懂，再进入共同理解。 ");
      return;
    }
    invitationContext.value = invitationContextFromEditableExpression(editableExpression.value);
    invitationContextStatus.value = "ready";
    stage.value = "INVITE";
    try {
      await requestSharedUnderstanding(room.value.roomId);
      updateRoom({ ...room.value, phaseV2: "UNDERSTANDING_GENERATING" });
      setNotice("success", "这张表达卡已由你确认，正在生成新的共同理解。 ");
      void pollUnderstanding();
      stage.value = "AI_PENDING";
    } catch {
      setNotice("success", "你的表达卡已确认，私人原话和 AI 对话没有分享。 ");
    }
  } catch (error) {
    setNotice("error", message(error, "卡片没有分享。请检查网络后重试，对话和草稿仍然保留。"));
  } finally {
    busy.value = false;
  }
}

async function pollExpressionJob(jobId: string) {
  if (!room.value || aiJobId.value !== jobId) return;
  try {
    const status = await roomApi.aiJobStatus(jobId);
    if (aiJobId.value !== jobId) return;
    if (stage.value === "WELCOME") {
      busy.value = false;
      return;
    }
    if (status.status === "SUCCEEDED") {
      if (!selectedMode.value || selectedMode.value === "PAUSE") return;
      const previous = editableExpression.value;
      const candidate = parseAiExpressionCandidate(status.result, selectedMode.value);
      const merged = mergeAiExpressionCandidate(previous, candidate);
      expressionUpdatedFieldKeys.value = currentExpressionOption.value.fields
        .filter((field) => previous.fields[field.key] !== merged.fields[field.key])
        .map((field) => field.key);
      editableExpression.value = merged;
      aiJobId.value = "";
      busy.value = false;
      expressionOrganizationFailure.value = "";
      openExpressionCandidate();
      setNotice("success", currentClarificationQuestion.value
        ? clarificationTurns.value.length
          ? "AI 已结合你的补充更新草稿，还有一个问题想向你确认。 "
          : "AI 已整理第一版，想先向你确认一个重要背景。 "
        : clarificationTurns.value.length
          ? "AI 已结合你的补充整理成表达卡，请确认或继续补充。 "
          : "AI 已整理成可编辑的表达卡，请确认或继续补充。 ");
      return;
    }
    if (
      status.status === "FAILED_FINAL" ||
      status.status === "STALE" ||
      status.status === "CANCELED"
    ) {
      recoverExpressionJobFailure(expressionJobFailureMessage(
        status.status,
        status.errorCode,
      ));
      return;
    }
    aiPollTimer = setTimeout(() => void pollExpressionJob(jobId), 1200);
  } catch (error) {
    if (aiJobId.value !== jobId) return;
    recoverExpressionJobFailure(message(error, "AI 状态暂时无法读取。"));
  }
}

function confirmPause() {
  return new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "暂停这次沟通？",
      content: "暂停后不会生成双方共识，也不会分享你的私人原话。房间会向双方真实显示为已暂停。",
      confirmText: "确认暂停",
      confirmColor: "#9d4c3d",
      cancelText: "继续整理",
      success: ({ confirm }) => resolve(confirm),
      fail: () => resolve(false),
    });
  });
}

async function next() {
  if (!room.value || !canContinue.value) return;
  if (stage.value === "EXPRESSION_REVIEW" && !expressionReviewIsSummary.value) {
    openExpressionReview();
    return;
  }
  if (stage.value === "MODE_SELECT" && selectedMode.value) {
    await chooseExpressionMode(selectedMode.value);
    return;
  }
  const attemptedStage = stage.value;
  clearNotice();
  busy.value = true;
  try {
    if (stage.value === "GOAL") {
      const result = await roomApi.setGoal(room.value.roomId, goal.value);
      updateRoom({ ...room.value, state: result.state, phaseV2: "PRIVATE_EXPRESSION" });
      stage.value = "RECORD";
    } else if (stage.value === "EXPRESSION_REVIEW") {
      const confirmed = await roomApi.confirmExpression(
        room.value.roomId,
        workspaceRevision.value,
        expressionSharePayload(editableExpression.value),
        editableExpression.value.invitation.title,
        editableExpression.value.invitation.summary,
      );
      clearEditorDraft(room.value.roomId, room.value.role);
      aiJobId.value = "";
      draftSaveState.value = "empty";
      updateRoom({ ...room.value, state: confirmed.state });
      if (room.value.role === "B") {
        dialogueState.value = await roomApi.startDialogue(room.value.roomId);
        updateRoom({ ...room.value, phaseV2: "DIALOGUE" });
        stage.value = "DIALOGUE";
        setNotice("success", "双方表达卡已确认。先互相确认听懂，再进入共同理解。 ");
      } else {
        invitationContext.value = invitationContextFromEditableExpression(editableExpression.value);
        invitationContextStatus.value = "ready";
        stage.value = "INVITE";
        try {
          await requestSharedUnderstanding(room.value.roomId);
          updateRoom({ ...room.value, phaseV2: "UNDERSTANDING_GENERATING" });
          setNotice("success", "双方表达卡已重新确认，正在生成新的共同理解。 ");
          void pollUnderstanding();
          stage.value = "AI_PENDING";
        } catch {
          setNotice("success", "你的表达卡已确认，私人原话没有分享。 ");
        }
      }
    } else if (activeNvcCard.value) {
      const nextStage = nextNvcStage(activeNvcCard.value.stage);
      stage.value = nextStage ?? "REVIEW";
    } else if (stage.value === "REVIEW") {
      if (roomIsDrafting(room.value)) {
        const result = await roomApi.saveDraft(
          room.value.roomId,
          transcript.value.trim(),
          perspective.meaning.trim(),
        );
        updateRoom({ ...room.value, state: result.state });
      }
      const approved = await roomApi.approvePerspective(room.value.roomId, {
        fact: perspective.fact.trim(),
        meaning: perspective.meaning.trim(),
        impact: perspective.impact.trim(),
        request: perspective.request.trim(),
      });
      if (editorSaveTimer) clearTimeout(editorSaveTimer);
      editorSaveTimer = null;
      clearEditorDraft(room.value.roomId, room.value.role);
      draftSaveState.value = "empty";
      updateRoom({ ...room.value, state: approved.state });
      if (stageForCurrentRoom(room.value, approved.state) === "COMMON") {
        await loadSnapshot(room.value);
        setNotice("success", "双方都已确认，现在可以查看共同视图。 ");
      } else {
        invitationContext.value = {
          inviterName: "邀请你的人",
          topic: perspective.fact.trim().slice(0, 180),
          title: "关于这次具体经历",
          summary: `发起方确认的背景是：${perspective.fact.trim().slice(0, 180)} 你可以先讲讲自己记得的情况。`,
          confirmedSummary: false,
        };
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
    setNotice("error", message(
      error,
      attemptedStage === "EXPRESSION_REVIEW"
        ? "卡片没有分享。请检查网络后重试，私人草稿仍然保留。"
        : "操作没有完成，请稍后重试。",
    ));
  } finally {
    busy.value = false;
  }
}

async function refreshRoom() {
  if (!room.value) return;
  clearNotice();
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
  const topic = resolvedInvitationContext.value.topic;
  if (!topic) {
    setNotice("error", "还没有可供对方理解的主题说明，请先返回修改表达卡。 ");
    return;
  }
  await shareRoomLink();
}

async function shareRoomLink() {
  if (!room.value) return;
  const topic = resolvedInvitationContext.value.topic;
  const fallback = topic
    ? `我想和你把一件事说开。关于：${topic}。沟通房间码：${room.value.code}`
    : `我想和你把这件事说开。沟通房间码：${room.value.code}`;
  const shareUrl = typeof location === "undefined"
    ? fallback
    : `${location.origin}${location.pathname}?room=${room.value.code}`;
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: invitationShareTitle.value, text: fallback, url: shareUrl });
      setNotice("success", "房间链接已分享。 ");
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  uni.setClipboardData({
    data: shareUrl,
    success: () => setNotice("success", "房间链接已复制，可以发给对方继续确认。 "),
    fail: () => setNotice("error", "无法复制，请手动分享房间码。 "),
  });
}

async function startInvitedExpression() {
  if (!room.value || room.value.role !== "B") return;
  acknowledgeInvitation(room.value.roomId);
  invitationClarifying.value = false;
  busy.value = true;
  try {
    await loadSnapshot(room.value);
    if (stage.value === "INVITATION_INTRO") stage.value = "RECORD";
    setNotice("info", "先说你的版本。对方暂时看不到这里的内容。 ");
  } catch (error) {
    stage.value = "RECORD";
    setNotice("error", message(error, "暂时无法同步房间进展，你仍可以先写下自己的版本。"));
  } finally {
    busy.value = Boolean(aiJobId.value);
  }
}

function showInvitationIntro() {
  invitationClarifying.value = false;
  stage.value = "INVITATION_INTRO";
}

async function refreshInvitationContext(roomId = room.value?.roomId) {
  if (!roomId) return;
  const requestVersion = ++invitationContextRequest;
  invitationContextStatus.value = "loading";
  try {
    const nextContext = await roomApi.invitationContext(roomId);
    if (room.value?.roomId !== roomId || requestVersion !== invitationContextRequest) return;
    invitationContext.value = nextContext;
    invitationContextStatus.value = "ready";
  } catch {
    if (room.value?.roomId !== roomId || requestVersion !== invitationContextRequest) return;
    if (invitationContext.value) {
      invitationContextStatus.value = "ready";
      return;
    }
    invitationContextStatus.value = "error";
  }
}

function copyInvitationClarification() {
  uni.setClipboardData({
    data: currentInvitationClarificationMessage.value,
    success: () => setNotice("success", "澄清消息已复制。请把它发给邀请你的人。 "),
    fail: () => setNotice("error", "复制失败，请手动联系邀请你的人补充背景。 "),
  });
}

function leaveInvitation() {
  returnToWelcome();
  setNotice("info", "你暂时离开了这次邀请，房间仍会保留，可以稍后再回来。 ");
}

function isAccepted(role: "A" | "B") {
  const agreement = snapshot.value?.agreement;
  return role === "A" ? Boolean(agreement?.accepted_a) : Boolean(agreement?.accepted_b);
}

function editNvcCard(key: keyof Perspective) {
  clearNotice();
  stage.value = nvcStageForKey(key);
}

function updateActiveNvcValue(value: string) {
  if (!activeNvcCard.value) return;
  perspective[activeNvcCard.value.key] = value;
}

async function acceptAgreement() {
  if (!room.value || ownAccepted.value) return;
  clearNotice();
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

function goBack() {
  clearNotice();
  if (aiConversationArchiveReadOnly.value) {
    aiConversationArchiveReadOnly.value = false;
    void resumeCurrentRoom();
    return;
  }
  if (stage.value === "EXPRESSION_REVIEW") {
    if (!expressionReviewIsSummary.value) {
      openExpressionReview();
      return;
    }
    clarificationSkipped.value = false;
    const pendingQuestion = currentClarificationQuestion.value;
    const question = pendingQuestion || addOptionalClarificationQuestion();
    if (question) {
      stage.value = "CLARIFICATION_CHAT";
      setNotice(
        "info",
        pendingQuestion
          ? "继续回答 AI。刚才的对话与表达卡都已保留。 "
          : "AI 没有必须追问的问题；你仍可以继续告诉它遗漏的背景。 ",
      );
    } else {
      expressionReviewStep.value = 0;
      setNotice("info", "这张表达卡目前没有待确认的问题；你仍可以直接修改内容。 ");
    }
    return;
  }
  stage.value = previousStage(stage.value);
}

async function refreshDialogue() {
  if (!room.value || busy.value) return;
  busy.value = true;
  try {
    dialogueState.value = await roomApi.dialogueState(room.value.roomId);
    setNotice("success", dialogueState.value.canAct ? "轮到你继续了。" : "已同步最新沟通进展。");
  } catch (error) {
    setNotice("error", message(error, "暂时无法同步沟通进展。"));
  } finally {
    busy.value = false;
  }
}

async function submitDialogueText(kind: "REFLECTION" | "RESPONSE", text: string) {
  if (!room.value || !dialogueState.value || busy.value) return;
  busy.value = true;
  clearNotice();
  try {
    await roomApi.appendDialogueTurn(
      room.value.roomId,
      dialogueState.value.revision,
      kind,
      dialogueState.value.focusTurnId,
      { text },
    );
    dialogueState.value = await roomApi.dialogueState(room.value.roomId);
    setNotice("success", kind === "REFLECTION" ? "复述已发送，等待对方确认是否准确。" : "回应已发送，下一轮开始了。");
  } catch (error) {
    setNotice("error", message(error, "这次内容没有发送，请刷新后重试。"));
  } finally {
    busy.value = false;
  }
}

async function confirmDialogueReflection(
  decision: "ACCURATE" | "NEEDS_CORRECTION",
  feedback: string,
) {
  if (!room.value || !dialogueState.value || busy.value) return;
  busy.value = true;
  clearNotice();
  try {
    await roomApi.appendDialogueTurn(
      room.value.roomId,
      dialogueState.value.revision,
      "REFLECTION_CONFIRMATION",
      dialogueState.value.focusTurnId,
      { decision, feedback },
    );
    dialogueState.value = await roomApi.dialogueState(room.value.roomId);
    setNotice("success", decision === "ACCURATE" ? "已确认对方听懂了你的意思。" : "纠正已发回，对方会再复述一次。");
  } catch (error) {
    setNotice("error", message(error, "确认没有提交，请刷新后重试。"));
  } finally {
    busy.value = false;
  }
}

async function pauseFromDialogue() {
  if (!room.value || !await confirmPause()) return;
  busy.value = true;
  try {
    await roomApi.pause(room.value.roomId);
    updateRoom({ ...room.value, phaseV2: "PAUSED" });
    stage.value = "PAUSED";
    setNotice("success", "沟通已暂停，完整进度会保留。 ");
  } catch (error) {
    setNotice("error", message(error, "暂时无法暂停，请稍后重试。"));
  } finally {
    busy.value = false;
  }
}

async function finishDialogueRound() {
  if (!room.value || busy.value) return;
  busy.value = true;
  try {
    updateRoom({ ...room.value, phaseV2: "UNDERSTANDING_GENERATING" });
    stage.value = "AI_PENDING";
    await ensureSharedUnderstanding();
    if (understandingFailure.value) {
      setNotice("error", understandingFailure.value);
    } else {
      setNotice("success", "正在根据双方确认的表达与多轮沟通整理阶段性共同理解。 ");
    }
  } catch (error) {
    updateRoom({ ...room.value, phaseV2: "DIALOGUE" });
    stage.value = "DIALOGUE";
    setNotice("error", message(error, "阶段总结没有开始，沟通记录仍然保留。"));
  } finally {
    busy.value = false;
  }
}

function returnToWelcome() {
  if (recording.value) stopRecording();
  recording.value = false;
  flushEditorDraft();
  if (aiPollTimer) clearTimeout(aiPollTimer);
  aiPollTimer = null;
  busy.value = false;
  clearNotice();
  stage.value = "WELCOME";
}

function openArchivedDialogue() {
  if (!dialogueState.value?.turns.length) return;
  historyReadOnly.value = true;
  stage.value = "DIALOGUE";
}

async function resumeCurrentRoom() {
  if (!room.value) return;
  clearNotice();
  busy.value = true;
  try {
    await loadSnapshot(room.value);
    setNotice("success", "已回到当前沟通，之前的进度仍在。 ");
  } catch (error) {
    stage.value = stageForCurrentRoom(room.value);
    restoreEditorDraft(room.value);
    setNotice("error", message(error, "暂时无法同步最新进展，已打开本机保存的进度。"));
  } finally {
    busy.value = Boolean(aiJobId.value);
  }
}

function startAnotherRoom() {
  clearActiveRoom();
  resetPrivateWorkspace();
  clearNotice();
  stage.value = "WELCOME";
}
</script>

<style lang="scss" src="./index.scss"></style>
