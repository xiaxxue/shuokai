"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Stage =
  | "landing"
  | "intent"
  | "voice"
  | "followup"
  | "review"
  | "invite"
  | "common"
  | "agreement"
  | "complete";

type TimelineEvent = {
  type: string;
  label: string;
  time: string;
};

type BackendSession = {
  roomId: string;
  code: string;
  role: "A" | "B";
  state: string;
};

type Perspective = {
  fact: string;
  meaning: string;
  impact: string;
  request: string;
};

const intentOptions = [
  {
    id: "understand",
    title: "我怕一开口又会吵起来",
    copy: "先把话整理清楚，再决定要不要邀请对方。",
  },
  {
    id: "repeat",
    title: "同一件事已经争论很多次",
    copy: "找到反复绕圈背后真正没有说开的部分。",
  },
  {
    id: "decision",
    title: "我们需要共同做一个决定",
    copy: "并排看见彼此在意的条件，而不是争论立场。",
  },
  {
    id: "repair",
    title: "我想修复一次不愉快",
    copy: "表达影响、承担责任，并找到可以重新开始的一步。",
  },
];

const stageMeta: Record<Stage, { state: string; step: number }> = {
  landing: { state: "READY", step: 0 },
  intent: { state: "GOAL_SETTING", step: 0 },
  voice: { state: "A_DRAFTING", step: 1 },
  followup: { state: "A_CLARIFYING", step: 1 },
  review: { state: "A_REVIEWING", step: 2 },
  invite: { state: "WAITING_FOR_B", step: 2 },
  common: { state: "REVIEWING_COMMON_VIEW", step: 3 },
  agreement: { state: "AGREEMENT_PENDING", step: 4 },
  complete: { state: "COMPLETED", step: 4 },
};

const stepLabels = ["开始", "表达", "确认", "共视", "约定"];

const demoTranscript =
  "我们本来说好周六下午一起去看展，我还提前推掉了朋友的邀请。结果他到出发前二十分钟才告诉我不去了。我生气的不是不能改计划，而是觉得我的时间根本没有被考虑。";

const perspectivesByRole: Record<"A" | "B", Perspective> = {
  A: {
    fact: "原定周六下午一起看展，对方在出发前二十分钟取消了计划。",
    meaning: "你担心自己的时间和为共同计划做出的安排没有被认真考虑。",
    impact: "你推掉了朋友的邀请，也失去了重新安排下午的机会。",
    request: "计划可以变化，但希望对方一旦知道有变化，就尽早告诉你。",
  },
  B: {
    fact: "周六上午才确定身体状态不适合外出，并在确认后告诉了对方。",
    meaning: "你担心过早说“可能取消”会制造不必要的焦虑，也希望周末保留调整空间。",
    impact: "在身体不舒服时仍感到需要立即解释清楚，压力变得更大。",
    request: "计划还不确定时可以先说明待定，但不希望被要求立刻给出完整解释。",
  },
};

function nowTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

export function SayOpenPrototype() {
  const [stage, setStage] = useState<Stage>("landing");
  const [intent, setIntent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [hasCapture, setHasCapture] = useState(false);
  const [transcript, setTranscript] = useState(demoTranscript);
  const [factAnswer, setFactAnswer] = useState("");
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acceptedA, setAcceptedA] = useState(false);
  const [acceptedB, setAcceptedB] = useState(false);
  const [session, setSession] = useState<BackendSession | null>(null);
  const [incomingCode, setIncomingCode] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [backendError, setBackendError] = useState("");
  const [authLabel, setAuthLabel] = useState("临时访客");
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [simulatedPartner, setSimulatedPartner] = useState(false);
  const [perspective, setPerspective] = useState<Perspective>(perspectivesByRole.A);
  const [events, setEvents] = useState<TimelineEvent[]>([
    { type: "ROOM_READY", label: "原型房间已准备", time: "—" },
  ]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const current = stageMeta[stage];
  const role = session?.role ?? "A";

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setAuthLabel(user?.email ?? (user ? "临时访客" : "尚未登录"));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setAuthLabel(nextSession?.user.email ?? (nextSession ? "临时访客" : "尚未登录"));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const code = new URLSearchParams(window.location.search).get("room")?.toUpperCase();
      if (!code) return;
      const saved = window.localStorage.getItem(`shuokai.supabase.room.${code}`);
      if (!saved) {
        setIncomingCode(code);
        return;
      }
      try {
        const restored = JSON.parse(saved) as BackendSession;
        setSession(restored);
        setPerspective(perspectivesByRole[restored.role]);
        const stageForState: Partial<Record<string, Stage>> = {
          GOAL_SETTING: "intent",
          A_DRAFTING: "voice",
          A_REVIEWING: "review",
          WAITING_FOR_B: "invite",
          B_DRAFTING: "voice",
          B_REVIEWING: "review",
          COMMON_VIEW_READY: "common",
          AGREEMENT_PENDING: "agreement",
          COMPLETED: "complete",
        };
        setStage(stageForState[restored.state] ?? "landing");
      } catch {
        setIncomingCode(code);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`room-${session.roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${session.roomId}`,
        },
        (payload) => {
          const serverState = String(payload.new.state ?? "");
          if (!serverState || serverState === session.state) return;
          rememberSession({ ...session, state: serverState });
          if (serverState === "COMMON_VIEW_READY") {
            appendEvent("COMMON_VIEW_READY", "双方批准版本已汇入共同空间");
            setStage("common");
          }
          if (serverState === "COMPLETED") {
            appendEvent("AGREEMENT_ACTIVATED", "双方共同启用了 7 天实验");
            setStage("complete");
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(
      () => setRecordingSeconds((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  function appendEvent(type: string, label: string) {
    setEvents((items) => [
      ...items,
      { type, label, time: nowTime() },
    ]);
  }

  function move(next: Stage, eventType?: string, label?: string) {
    if (eventType && label) appendEvent(eventType, label);
    setStage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function ensureAuth() {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    const { data: signedIn, error } = await supabase.auth.signInAnonymously();
    if (error) {
      if (error.message.toLowerCase().includes("anonymous sign-ins are disabled")) {
        throw new Error("Supabase 匿名登录尚未开启，请在 Auth → Providers 中开启 Anonymous Sign-Ins。");
      }
      throw error;
    }
    if (!signedIn.session) throw new Error("无法建立临时访客会话。");
    return signedIn.session;
  }

  async function backendAction<T extends Record<string, unknown>>(
    payload: Record<string, unknown>,
  ) {
    await ensureAuth();
    const action = String(payload.action ?? "");
    const calls: Record<string, { fn: string; args: Record<string, unknown> }> = {
      create: {
        fn: "create_room",
        args: { p_display_name: payload.displayName },
      },
      join: {
        fn: "join_room",
        args: { p_code: payload.code, p_display_name: payload.displayName },
      },
      set_goal: {
        fn: "set_room_goal",
        args: { p_room_id: payload.roomId, p_goal: payload.goal },
      },
      save_draft: {
        fn: "save_private_draft",
        args: {
          p_room_id: payload.roomId,
          p_transcript: payload.transcript,
          p_clarification: payload.clarification,
        },
      },
      approve_perspective: {
        fn: "approve_perspective",
        args: {
          p_room_id: payload.roomId,
          p_fact: (payload.cards as Perspective).fact,
          p_meaning: (payload.cards as Perspective).meaning,
          p_impact: (payload.cards as Perspective).impact,
          p_request: (payload.cards as Perspective).request,
        },
      },
      simulate_partner: {
        fn: "simulate_partner",
        args: { p_room_id: payload.roomId },
      },
      propose_agreement: {
        fn: "propose_agreement",
        args: {
          p_room_id: payload.roomId,
          p_proposal: payload.proposal,
          p_review_at: payload.reviewAt,
        },
      },
      accept_agreement: {
        fn: "accept_agreement",
        args: { p_room_id: payload.roomId },
      },
    };
    const call = calls[action];
    if (!call) throw new Error("未知的后端操作。");
    const { data, error } = await supabase.rpc(call.fn, call.args);
    if (error) throw new Error(error.message || "Supabase 请求失败");
    return data as T;
  }

  function rememberSession(next: BackendSession) {
    setSession(next);
    window.localStorage.setItem(`shuokai.supabase.room.${next.code}`, JSON.stringify(next));
  }

  async function createBackendRoom(demo = false) {
    setIsSyncing(true);
    setBackendError("");
    try {
      const created = await backendAction<BackendSession>({
        action: "create",
        displayName: "Lin",
      });
      let next = { ...created, role: "A" as const };
      appendEvent("ROOM_PERSISTED", `后端房间 ${created.code} 已创建`);
      if (demo) {
        const goal = await backendAction<{ state: string }>({
          action: "set_goal",
          roomId: created.roomId,
          goal: "understand",
        });
        const draft = await backendAction<{ state: string }>({
          action: "save_draft",
          roomId: created.roomId,
          transcript: demoTranscript,
          clarification: "出发前二十分钟才告诉我",
        });
        next = { ...next, state: draft.state || goal.state };
        rememberSession(next);
        setIntent("understand");
        setPerspective(perspectivesByRole.A);
        setHasCapture(true);
        setFactAnswer("出发前二十分钟才告诉我");
        setStage("review");
      } else {
        rememberSession(next);
        setStage("intent");
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "无法创建房间");
    } finally {
      setIsSyncing(false);
    }
  }

  async function joinBackendRoom() {
    setIsSyncing(true);
    setBackendError("");
    try {
      const joined = await backendAction<BackendSession>({
        action: "join",
        code: incomingCode,
        displayName: "Jun",
      });
      if (joined.role === "A") {
        throw new Error("这是你发起的房间。请用另一个浏览器或无痕窗口体验 B 的独立身份。");
      }
      rememberSession(joined);
      setPerspective(perspectivesByRole[joined.role]);
      setHasCapture(false);
      setTranscript(
        "我周六早上开始不舒服，但当时还不确定要不要取消。我希望等确定以后再说，因为不想让对方一直等一个不确定的答案。",
      );
      appendEvent("B_JOINED", `B 已加入后端房间 ${joined.code}`);
      setStage("voice");
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "无法加入房间");
    } finally {
      setIsSyncing(false);
    }
  }

  async function continueFromIntent() {
    if (!session) return;
    setIsSyncing(true);
    setBackendError("");
    try {
      const result = await backendAction<{ state: string }>({
        action: "set_goal",
        roomId: session.roomId,
        goal: intent,
      });
      rememberSession({ ...session, state: result.state });
      move("voice", "VOICE_INTAKE_OPENED", "进入 A 的私人表达");
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "无法保存沟通目标");
    } finally {
      setIsSyncing(false);
    }
  }

  async function submitPrivateDraft() {
    if (!session) return;
    setIsSyncing(true);
    setBackendError("");
    try {
      const result = await backendAction<{ state: string }>({
        action: "save_draft",
        roomId: session.roomId,
        transcript,
        clarification: factAnswer,
      });
      rememberSession({ ...session, state: result.state });
      move("review", "PRIVATE_DRAFT_SAVED", `${role} 的私人表达已加密保存`);
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "无法保存私人表达");
    } finally {
      setIsSyncing(false);
    }
  }

  async function approvePerspective() {
    if (!session) return;
    setIsSyncing(true);
    setBackendError("");
    try {
      const result = await backendAction<{ state: string; version: number }>({
        action: "approve_perspective",
        roomId: session.roomId,
        cards: perspective,
      });
      rememberSession({ ...session, state: result.state });
      move(
        role === "A" ? "invite" : "common",
        `${role}_PERSPECTIVE_APPROVED`,
        `${role} 批准了观点卡 v${result.version}`,
      );
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "无法批准观点卡");
    } finally {
      setIsSyncing(false);
    }
  }

  async function simulatePartner() {
    if (!session) return;
    setIsSyncing(true);
    setBackendError("");
    try {
      const result = await backendAction<{ state: string }>({
        action: "simulate_partner",
        roomId: session.roomId,
      });
      rememberSession({ ...session, state: result.state });
      setSimulatedPartner(true);
      move("common", "B_PERSPECTIVE_APPROVED", "B 已加入并批准自己的观点卡");
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "无法完成双人演示");
    } finally {
      setIsSyncing(false);
    }
  }

  async function proposeAgreement() {
    if (!session) return;
    setIsSyncing(true);
    setBackendError("");
    try {
      const result = await backendAction<{ state: string }>({
        action: "propose_agreement",
        roomId: session.roomId,
        proposal: "计划可能发生变化时，先发送一个“待定”信号。",
        reviewAt: "2026-08-12T20:30:00+08:00",
      });
      rememberSession({ ...session, state: result.state });
      if (simulatedPartner) setAcceptedB(true);
      move("agreement", "AGREEMENT_PROPOSED", "已创建可逆的 7 天实验");
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "无法创建约定");
    } finally {
      setIsSyncing(false);
    }
  }

  async function activateAgreement() {
    if (!session) return;
    setIsSyncing(true);
    setBackendError("");
    try {
      const result = await backendAction<{ state: string; activated: boolean }>({
        action: "accept_agreement",
        roomId: session.roomId,
      });
      if (session.role === "A") setAcceptedA(true);
      if (session.role === "B") setAcceptedB(true);
      rememberSession({ ...session, state: result.state });
      if (result.activated) {
        move("complete", "AGREEMENT_ACTIVATED", "双方共同启用了 7 天实验");
      } else {
        appendEvent(`${session.role}_AGREEMENT_ACCEPTED`, "已确认，等待对方回应");
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "无法启用约定");
    } finally {
      setIsSyncing(false);
    }
  }

  async function saveWithEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSyncing(true);
    setEmailStatus("");
    setBackendError("");
    try {
      const activeSession = await ensureAuth();
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      if (activeSession.user.is_anonymous) {
        const { error } = await supabase.auth.updateUser(
          { email: email.trim() },
          { emailRedirectTo: redirectTo },
        );
        if (error) {
          if (error.message.toLowerCase().includes("already")) {
            const { error: signInError } = await supabase.auth.signInWithOtp({
              email: email.trim(),
              options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
            });
            if (signInError) throw signInError;
            setEmailStatus("这个邮箱已有账号，登录链接已经发送。");
          } else {
            throw error;
          }
        } else {
          setEmailStatus("确认邮件已发送。点击邮件里的链接后，这个临时身份会绑定到邮箱。");
        }
      } else {
        setEmailStatus(`当前记录已经由 ${activeSession.user.email ?? "这个邮箱"} 保存。`);
      }
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "无法发送邮箱确认链接");
    } finally {
      setIsSyncing(false);
    }
  }

  async function startRecording() {
    setRecordingError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setRecordingError("当前浏览器无法录音，你可以使用演示内容继续体验。");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setHasCapture(true);
        stream.getTracks().forEach((track) => track.stop());
        appendEvent("AUDIO_CAPTURED", "A 的语音已在本机完成录制");
      };
      recorder.start();
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch {
      setRecordingError("没有获得麦克风权限，你可以使用演示内容继续体验。");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function useDemoCapture() {
    setHasCapture(true);
    setRecordingSeconds(48);
    appendEvent("DEMO_AUDIO_SELECTED", "已载入演示语音与转写");
  }

  function selectIntent(id: string) {
    setIntent(id);
    appendEvent("GOAL_SELECTED", "A 选择了本次沟通目标");
  }

  function resetPrototype() {
    setStage("landing");
    setIntent("");
    setIsRecording(false);
    setRecordingSeconds(0);
    setHasCapture(false);
    setFactAnswer("");
    setApproved(false);
    setCopied(false);
    setAcceptedA(false);
    setAcceptedB(false);
    setPerspective(perspectivesByRole.A);
    setSession(null);
    setIncomingCode("");
    setBackendError("");
    setSimulatedPartner(false);
    window.history.replaceState({}, "", window.location.pathname);
    setEvents([
      { type: "ROOM_READY", label: "原型房间已准备", time: "—" },
    ]);
  }

  async function copyInvite() {
    const inviteUrl = session
      ? `${window.location.origin}${window.location.pathname}?room=${session.code}`
      : window.location.href;
    const message = `我现在很难把这件事说清楚，又不想继续互相伤害。我先整理了自己的版本。如果你愿意，可以在「说开」里讲讲你的版本：${inviteUrl}`;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      appendEvent("INVITE_COPIED", "邀请文案已复制");
    } catch {
      setCopied(true);
    }
  }

  return (
    <main className="prototype-shell">
      <aside className="brand-rail" aria-label="产品信息与流程状态">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <div>
              <strong>说开</strong>
              <small>SHUOKAI</small>
            </div>
          </div>

          <p className="brand-promise">理解，不必同意。</p>
          <p className="brand-description">
            当普通聊天开始重复、误解或升级，为彼此留一个可以慢下来表达的空间。
          </p>

          <div className="stepper" aria-label="沟通进度">
            {stepLabels.map((label, index) => (
              <div
                className={`step ${current.step === index ? "is-current" : ""} ${current.step > index ? "is-done" : ""}`}
                key={label}
              >
                <span>{current.step > index ? "✓" : index + 1}</span>
                <p>{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rail-footer">
          <div className="privacy-note">
            <span aria-hidden="true">◌</span>
            <p>
              <strong>私人内容默认不共享</strong>
              只有本人确认的版本，才能进入共同空间。
            </p>
          </div>
          <button className="quiet-button" onClick={resetPrototype} type="button">
            重新体验
          </button>
        </div>
      </aside>

      <section className="experience-column">
        <header className="mobile-header">
          <div className="brand-lockup compact">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <div>
              <strong>说开</strong>
              <small>SHUOKAI</small>
            </div>
          </div>
          <span className="prototype-badge">交互原型</span>
        </header>

        <div className="experience-topline">
          <span className="prototype-badge">
            {session ? `Supabase 已连接 · 房间 ${session.code}` : "Supabase 全栈原型 · AI 内容为模拟"}
          </span>
          <div className="topline-actions">
            <button
              className="account-button"
              onClick={() => setShowEmailPanel((value) => !value)}
              type="button"
            >
              {authLabel === "临时访客" || authLabel === "尚未登录" ? "用邮箱保存" : authLabel}
            </button>
            <span className="state-pill">{session?.state ?? current.state}</span>
          </div>
        </div>

        {showEmailPanel && (
          <form className="email-panel" onSubmit={(event) => void saveWithEmail(event)}>
            <div>
              <strong>用邮箱保存这段旅程</strong>
              <span>无需密码。我们只发送一次确认或登录链接。</span>
            </div>
            <input
              aria-label="邮箱地址"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            <button disabled={isSyncing} type="submit">
              {isSyncing ? "发送中…" : "发送链接"}
            </button>
            {emailStatus && <p>{emailStatus}</p>}
          </form>
        )}

        {backendError && (
          <div className="backend-error" role="alert">
            <span>后端没有完成这一步</span>
            <p>{backendError}</p>
          </div>
        )}

        <div className="app-surface">
          {stage === "landing" && incomingCode && (
            <section className="screen join-screen">
              <div className="join-code">房间 {incomingCode}</div>
              <div className="eyebrow">有人邀请你一起说开</div>
              <h2>你可以先讲自己的版本，<br />对方不会看到原始表达。</h2>
              <p className="lead">
                只有你亲自确认的观点卡，才会进入双方的共同空间。加入不代表同意对方。
              </p>
              <div className="join-privacy">
                <span>私人草稿</span>
                <strong>仅自己可见</strong>
                <span>观点卡</span>
                <strong>确认后共享</strong>
              </div>
              <button
                className="primary-button hero-button"
                disabled={isSyncing}
                onClick={() => void joinBackendRoom()}
                type="button"
              >
                <span>{isSyncing ? "正在加入…" : "用我的版本加入"}</span>
                <span aria-hidden="true">→</span>
              </button>
              <button className="text-button" onClick={resetPrototype} type="button">
                暂时不加入
              </button>
            </section>
          )}

          {stage === "landing" && !incomingCode && (
            <section className="screen landing-screen">
              <div className="eyebrow">当聊天失效之后</div>
              <h1>
                先别急着说服，
                <br />
                试着把话<span>说开。</span>
              </h1>
              <p className="lead">
                你可以先独自说完。AI 会帮助你区分发生的事、你的理解、受到的影响和真正的请求。
              </p>

              <button
                className="primary-button hero-button"
                disabled={isSyncing}
                onClick={() => void createBackendRoom(false)}
                type="button"
              >
                <span>{isSyncing ? "正在准备私人房间…" : "我想说开一件事"}</span>
                <span aria-hidden="true">→</span>
              </button>

              <button
                className="text-button"
                disabled={isSyncing}
                onClick={() => void createBackendRoom(true)}
                type="button"
              >
                直接查看全栈双人演示
              </button>

              <div className="trust-row">
                <span>不判断对错</span>
                <span>不擅自转发</span>
                <span>随时可以退出</span>
              </div>
            </section>
          )}

          {stage === "intent" && (
            <section className="screen">
              <ScreenHeader
                kicker="先确定这次的目标"
                title="你现在最需要什么？"
                copy="没有正确答案。这个选择只会改变 AI 接下来如何提问。"
              />

              <div className="option-list">
                {intentOptions.map((item) => (
                  <button
                    className={`intent-card ${intent === item.id ? "selected" : ""}`}
                    key={item.id}
                    onClick={() => selectIntent(item.id)}
                    type="button"
                  >
                    <span className="radio" aria-hidden="true" />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.copy}</small>
                    </span>
                  </button>
                ))}
              </div>

              <BottomActions
                back={() => move("landing")}
                next={() => void continueFromIntent()}
                disabled={!intent || isSyncing}
                nextLabel={isSyncing ? "正在保存…" : "开始讲述"}
              />
            </section>
          )}

          {stage === "voice" && (
            <section className="screen voice-screen">
              <ScreenHeader
                kicker={role === "B" ? "这是你的独立空间" : "只有你能看到"}
                title="先完整地说出来"
                copy="不用组织语言，也不用照顾对方的感受。AI 会在你说完以后再提问。"
              />

              <div className={`recording-orb ${isRecording ? "recording" : ""}`}>
                <div className="wave" aria-hidden="true">
                  {Array.from({ length: 15 }).map((_, index) => (
                    <span key={index} style={{ animationDelay: `${index * 70}ms` }} />
                  ))}
                </div>
                <button
                  aria-label={isRecording ? "结束录音" : "开始录音"}
                  className="mic-button"
                  onClick={isRecording ? stopRecording : startRecording}
                  type="button"
                >
                  <span aria-hidden="true">{isRecording ? "■" : "●"}</span>
                </button>
                <strong>
                  {isRecording
                    ? `正在倾听 · ${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`
                    : hasCapture
                      ? "已经记录下来"
                      : "点击开始讲述"}
                </strong>
                <small>{isRecording ? "说完后点击方块结束" : "录音仅用于当前原型体验"}</small>
              </div>

              {recordingError && <p className="inline-error">{recordingError}</p>}

              {!hasCapture && !isRecording && (
                <button className="demo-button" onClick={useDemoCapture} type="button">
                  没准备好开口？使用演示语音
                </button>
              )}

              {hasCapture && (
                <div className="transcript-panel">
                  <div className="panel-label">
                    <span>转写内容</span>
                    <small>演示文本，可修改</small>
                  </div>
                  {audioUrl && <audio controls src={audioUrl} />}
                  <textarea
                    aria-label="语音转写内容"
                    onChange={(event) => setTranscript(event.target.value)}
                    rows={5}
                    value={transcript}
                  />
                </div>
              )}

              <BottomActions
                back={() => (role === "B" ? resetPrototype() : move("intent"))}
                next={() => move("followup", "TRANSCRIPT_CONFIRMED", "A 确认了语音转写")}
                disabled={!hasCapture || !transcript.trim()}
                nextLabel="让 AI 帮我整理"
              />
            </section>
          )}

          {stage === "followup" && (
            <section className="screen">
              <ScreenHeader
                kicker="AI 正在澄清一个关键点"
                title="我先确认一下具体发生了什么"
                copy="AI 不会替你猜测对方的动机，只补全对方可以理解的事实。"
              />

              <div className="ai-message">
                <div className="ai-avatar">开</div>
                <div>
                  <span>说开助手</span>
                  <p>
                    {role === "A"
                      ? "你说“我的时间根本没有被考虑”。在这次事件里，对方具体什么时候告诉你计划改变？"
                      : "你说当时还不确定是否取消。你第一次意识到计划可能发生变化，具体是什么时候？"}
                  </p>
                </div>
              </div>

              <div className="answer-grid">
                {(role === "A"
                  ? [
                      "出发前二十分钟才告诉我",
                      "临时取消，也没有解释",
                      "不是时间问题，我想自己说明",
                    ]
                  : [
                      "周六早上开始觉得不舒服",
                      "中午才确定不能出门",
                      "不是时间问题，我想自己说明",
                    ]
                ).map((answer) => (
                  <button
                    className={factAnswer === answer ? "selected" : ""}
                    key={answer}
                    onClick={() => setFactAnswer(answer)}
                    type="button"
                  >
                    {answer}
                  </button>
                ))}
              </div>

              <div className="one-question-note">
                <span>1</span>
                <p>
                  <strong>一次只问一个问题</strong>
                  避免在情绪激动时变成一份漫长问卷。
                </p>
              </div>

              <BottomActions
                back={() => move("voice")}
                next={() => void submitPrivateDraft()}
                disabled={!factAnswer || isSyncing}
                nextLabel={isSyncing ? "正在私密保存…" : "生成我的版本"}
              />
            </section>
          )}

          {stage === "review" && (
            <section className="screen">
              <ScreenHeader
                kicker="发送之前，先由你确认"
                title="这是我对你的理解"
                copy="它仍然只在你的私人空间里。哪里不准确，可以直接修改。"
              />

              <div className="perspective-stack">
                <PerspectiveCard
                  index="01"
                  label="发生的事情"
                  text={perspective.fact}
                  onValueChange={(value) =>
                    setPerspective((current) => ({ ...current, fact: value }))
                  }
                  tone="fact"
                />
                <PerspectiveCard
                  index="02"
                  label="你的理解"
                  text={perspective.meaning}
                  onValueChange={(value) =>
                    setPerspective((current) => ({ ...current, meaning: value }))
                  }
                  tone="meaning"
                />
                <PerspectiveCard
                  index="03"
                  label="对你的影响"
                  text={perspective.impact}
                  onValueChange={(value) =>
                    setPerspective((current) => ({ ...current, impact: value }))
                  }
                  tone="impact"
                />
                <PerspectiveCard
                  index="04"
                  label="你真正的请求"
                  text={perspective.request}
                  onValueChange={(value) =>
                    setPerspective((current) => ({ ...current, request: value }))
                  }
                  tone="request"
                />
              </div>

              <label className="approval-check">
                <input
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                  type="checkbox"
                />
                <span aria-hidden="true" />
                <p>
                  <strong>这准确表达了我的意思</strong>
                  确认后，这个版本才可以被分享。
                </p>
              </label>

              <BottomActions
                back={() => move("followup")}
                next={() => void approvePerspective()}
                disabled={!approved || isSyncing}
                nextLabel={isSyncing ? "正在写入批准记录…" : "确认我的版本"}
              />
            </section>
          )}

          {stage === "invite" && (
            <section className="screen invite-screen">
              <ScreenHeader
                kicker="你已经把自己的部分说清楚了"
                title="现在，要邀请对方吗？"
                copy="对方可以稍后回应，也可以拒绝。邀请不会展示你的原始录音。"
              />

              <div className="invite-preview">
                <div className="invite-logo">说开</div>
                <span>Lin 邀请你一起说开一件事</span>
                <h3>“我想让我们互相理解，不是证明谁是对的。”</h3>
                <div className="invite-meta">
                  <span>约 3 分钟</span>
                  <span>原始回答仅自己可见</span>
                </div>
                <div className="room-code-display">
                  <small>房间码</small>
                  <strong>{session?.code ?? "——"}</strong>
                </div>
                <button type="button">先看看对方想表达什么</button>
              </div>

              <div className="invite-actions">
                <button className="secondary-button" onClick={copyInvite} type="button">
                  {copied ? "邀请文案已复制" : "复制低压力邀请"}
                </button>
                <button
                  className="primary-button"
                  disabled={isSyncing}
                  onClick={() => void simulatePartner()}
                  type="button"
                >
                  {isSyncing ? "正在写入双方版本…" : "模拟对方完成表达"}
                </button>
              </div>

              <button className="text-button" type="button">
                暂时只保存给自己
              </button>
            </section>
          )}

          {stage === "common" && (
            <section className="screen common-screen">
              <ScreenHeader
                kicker="双方都已确认自己的版本"
                title="你们真正没有说开的，是这里"
                copy="理解对方，不代表必须同意。共同视图只使用双方批准过的内容。"
              />

              <div className="common-goal">
                <span>共同点</span>
                <h3>你们都希望周末可以放松，也不想每次计划变化都变成一次争吵。</h3>
                <div className="both-approved">
                  <span>A 已认可</span>
                  <span>B 已认可</span>
                </div>
              </div>

              <div className="difference-map">
                <div className="difference-heading">
                  <span>真实分歧</span>
                  <small>不是“谁更在乎这段关系”</small>
                </div>
                <div className="view-columns">
                  <article>
                    <span>A 的版本</span>
                    <p>共同计划改变时，应当尽早告知，让彼此能够重新安排时间。</p>
                  </article>
                  <div className="versus">≠</div>
                  <article>
                    <span>B 的版本</span>
                    <p>周末计划应保留自由度；不确定的变化很难提前给出明确通知。</p>
                  </article>
                </div>
                <div className="core-question">
                  <span>需要一起回答的问题</span>
                  <p>“知道可能有变化”时就应该告知，还是确定取消以后再告知？</p>
                </div>
              </div>

              <div className="source-note">
                <span>↳</span>
                每个结论都可以追溯到双方批准的观点卡，不使用私人草稿。
              </div>

              <BottomActions
                back={() => move("invite")}
                next={() => void proposeAgreement()}
                disabled={isSyncing}
                nextLabel={isSyncing ? "正在创建约定…" : "尝试一个现实办法"}
              />
            </section>
          )}

          {stage === "agreement" && (
            <section className="screen">
              <ScreenHeader
                kicker="不寻找永久正确答案"
                title="先试行一个可逆的办法"
                copy="到期后分别评价效果，而不是现在承诺永远这样做。"
              />

              <div className="experiment-card">
                <div className="experiment-top">
                  <span>7 天实验</span>
                  <small>可随时提出调整</small>
                </div>
                <h3>计划可能发生变化时，先发送一个“待定”信号。</h3>
                <ul>
                  <li>不需要立刻解释完整原因</li>
                  <li>最迟在确定变化后 30 分钟内更新</li>
                  <li>收到信号的一方可以先安排自己的时间</li>
                </ul>
                <div className="review-date">
                  <span>复盘</span>
                  <strong>8 月 12 日 · 晚上 20:30</strong>
                </div>
              </div>

              <div className="acceptance-list">
                <label>
                  <button
                    aria-label="切换 A 的接受状态"
                    className={acceptedA ? "accepted" : ""}
                    disabled
                    type="button"
                  >
                    {acceptedA ? "✓" : ""}
                  </button>
                  <span>
                    <strong>Lin</strong>
                    {acceptedA ? "已自愿接受" : "等待确认"}
                  </span>
                </label>
                <label>
                  <button
                    aria-label="切换 B 的接受状态"
                    className={acceptedB ? "accepted" : ""}
                    disabled
                    type="button"
                  >
                    {acceptedB ? "✓" : ""}
                  </button>
                  <span>
                    <strong>Jun</strong>
                    {acceptedB ? "已自愿接受" : "等待确认"}
                  </span>
                </label>
              </div>

              <BottomActions
                back={() => move("common")}
                next={() => void activateAgreement()}
                disabled={(session?.role === "A" ? acceptedA : acceptedB) || isSyncing}
                nextLabel={isSyncing ? "正在记录同意…" : `确认 ${session?.role ?? "我"} 接受这个实验`}
              />
            </section>
          )}

          {stage === "complete" && (
            <section className="screen complete-screen">
              <div className="completion-mark" aria-hidden="true">
                ✓
              </div>
              <div className="eyebrow">这一次已经说开</div>
              <h2>不是谁赢了，<br />是你们终于在讨论同一个问题。</h2>
              <p>
                系统将在 7 天后分别询问：这个办法是否让你更自由，也让对方更安心？
              </p>

              <div className="completion-summary">
                <span>本次留下</span>
                <div>
                  <strong>1</strong><small>个共同点</small>
                  <strong>1</strong><small>个真实分歧</small>
                  <strong>1</strong><small>个可验证实验</small>
                </div>
              </div>

              <button className="primary-button" onClick={resetPrototype} type="button">
                再体验一次
              </button>
            </section>
          )}
        </div>

        <details className="state-console">
          <summary>
            <span>工程视图</span>
            <strong>{session?.state ?? current.state}</strong>
            <small>查看状态机事件</small>
          </summary>
          <div className="console-body">
            <div className="console-heading">
              <span>ROOM / {session?.code ?? "LOCAL_DEMO"}</span>
              <span>VERSION {events.length}</span>
            </div>
            <div className="event-list">
              {events
                .slice()
                .reverse()
                .map((event, index) => (
                  <div className={index === 0 ? "latest" : ""} key={`${event.type}-${event.time}-${index}`}>
                    <time>{event.time}</time>
                    <code>{event.type}</code>
                    <span>{event.label}</span>
                  </div>
                ))}
            </div>
          </div>
        </details>
      </section>
    </main>
  );
}

function ScreenHeader({
  kicker,
  title,
  copy,
}: {
  kicker: string;
  title: string;
  copy: string;
}) {
  return (
    <header className="screen-header">
      <div className="eyebrow">{kicker}</div>
      <h2>{title}</h2>
      <p>{copy}</p>
    </header>
  );
}

function BottomActions({
  back,
  next,
  nextLabel,
  disabled = false,
}: {
  back: () => void;
  next: () => void;
  nextLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="bottom-actions">
      <button className="back-button" onClick={back} type="button">
        ← 返回
      </button>
      <button
        className="primary-button"
        disabled={disabled}
        onClick={next}
        type="button"
      >
        {nextLabel} <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

function PerspectiveCard({
  index,
  label,
  text,
  onValueChange,
  tone,
}: {
  index: string;
  label: string;
  text: string;
  onValueChange: (value: string) => void;
  tone: "fact" | "meaning" | "impact" | "request";
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  return (
    <article className={`perspective-card ${tone}`}>
      <div className="perspective-card-top">
        <span>{index}</span>
        <strong>{label}</strong>
        <button onClick={() => setEditing((current) => !current)} type="button">
          {editing ? "完成" : "修改"}
        </button>
      </div>
      {editing ? (
        <textarea
          aria-label={`修改${label}`}
          onChange={(event) => {
            setValue(event.target.value);
            onValueChange(event.target.value);
          }}
          rows={3}
          value={value}
        />
      ) : (
        <p>{value}</p>
      )}
    </article>
  );
}
