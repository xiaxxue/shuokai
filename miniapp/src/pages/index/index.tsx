import { useEffect, useMemo, useState } from "react";
import { Button, Input, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad, useShareAppMessage } from "@tarojs/taro";
import type { ClientStage } from "../../domain/room-state";
import {
  canNavigateBack,
  clientStageOrder,
  previousStage,
  stageForRoom,
} from "../../domain/room-state";
import { perspectiveFromDraft } from "../../domain/perspective";
import type { Perspective, RoomSession, RoomSnapshot } from "../../domain/types";
import { loginWithWechat, roomApi, transcribeAudio } from "../../services/api";
import { startRecording, stopRecording } from "../../services/recorder";
import "./index.scss";

const goals = [
  "让我被准确理解",
  "理解对方为什么这样想",
  "找到一个双方都能尝试的下一步",
];

const initialPerspective: Perspective = { fact: "", meaning: "", impact: "", request: "" };

function Header({ stage }: { stage: ClientStage }) {
  const step = Math.max(0, clientStageOrder.indexOf(stage) - 1);
  const total = clientStageOrder.length - 1;
  const current = Math.min(step + 1, total);
  return (
    <View className="topbar">
      <View>
        <Text className="brand">说开</Text>
        <Text className="brand-en">SHUOKAI</Text>
      </View>
      {stage !== "WELCOME" && <Text className="progress-copy">{current} / {total}</Text>}
      <View className="progress-track">
        <View className="progress-fill" style={{ width: `${(current / total) * 100}%` }} />
      </View>
    </View>
  );
}

export default function IndexPage() {
  const [stage, setStage] = useState<ClientStage>("WELCOME");
  const [room, setRoom] = useState<RoomSession | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [goal, setGoal] = useState(goals[0]);
  const [joinCode, setJoinCode] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [clarification, setClarification] = useState("");
  const [perspective, setPerspective] = useState(initialPerspective);

  useEffect(() => {
    void loginWithWechat().catch(() => undefined);
  }, []);

  useLoad((options) => {
    if (typeof options.room === "string") {
      setJoinCode(options.room.slice(0, 7).toUpperCase());
    }
  });

  useShareAppMessage(() => ({
    title: "我想和你把这件事说开",
    path: `/pages/index/index?room=${room?.code ?? ""}`,
  }));

  const canContinue = useMemo(() => {
    if (stage === "RECORD") return transcript.trim().length > 0;
    if (stage === "CLARIFY") return clarification.trim().length > 0;
    if (stage === "REVIEW") {
      return Object.values(perspective).every((value) => value.trim().length > 0);
    }
    return true;
  }, [clarification, perspective, stage, transcript]);

  async function createRoom() {
    setBusy(true);
    try {
      await loginWithWechat();
      const created = await roomApi.create();
      setRoom(created);
      setStage(stageForRoom(created.role, created.state));
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "创建失败", icon: "none" });
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (joinCode.trim().length !== 7) {
      Taro.showToast({ title: "请输入 7 位房间码", icon: "none" });
      return;
    }
    setBusy(true);
    try {
      const joined = await roomApi.join(joinCode.trim().toUpperCase());
      setRoom(joined);
      const joinedStage = stageForRoom(joined.role, joined.state);
      if (joinedStage === "COMMON") setSnapshot(await roomApi.snapshot(joined.roomId));
      setStage(joinedStage);
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "加入失败", icon: "none" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    try {
      if (!recording) {
        const { completion } = await startRecording();
        setRecording(true);
        void completion
          .then(async (filePath) => {
            setRecording(false);
            setBusy(true);
            setTranscript(await transcribeAudio(filePath));
          })
          .catch((error) => {
            setRecording(false);
            Taro.showToast({ title: error instanceof Error ? error.message : "录音失败", icon: "none" });
          })
          .finally(() => setBusy(false));
        return;
      }
      setBusy(true);
      stopRecording();
    } catch (error) {
      setRecording(false);
      Taro.showToast({ title: error instanceof Error ? error.message : "录音失败", icon: "none" });
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (!room) return;
    setBusy(true);
    try {
      if (stage === "GOAL") {
        await roomApi.setGoal(room.roomId, goal);
        setStage("RECORD");
      } else if (stage === "RECORD") {
        setStage("CLARIFY");
      } else if (stage === "CLARIFY") {
        await roomApi.saveDraft(room.roomId, transcript, clarification);
        setPerspective(perspectiveFromDraft(transcript, clarification));
        setStage("REVIEW");
      } else if (stage === "REVIEW") {
        const approved = await roomApi.approvePerspective(room.roomId, perspective);
        const updatedRoom = { ...room, state: approved.state };
        setRoom(updatedRoom);
        if (stageForRoom(room.role, approved.state) === "COMMON") {
          setSnapshot(await roomApi.snapshot(room.roomId));
          setStage("COMMON");
        } else {
          setStage("INVITE");
        }
      }
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "请稍后重试", icon: "none" });
    } finally {
      setBusy(false);
    }
  }

  async function refreshRoom() {
    if (!room) return;
    setBusy(true);
    try {
      const latest = await roomApi.snapshot(room.roomId);
      setSnapshot(latest);
      setRoom({ ...room, state: latest.room.state });
      const nextStage = stageForRoom(room.role, latest.room.state);
      if (nextStage === "COMMON") setStage(nextStage);
      else Taro.showToast({ title: "还在等待对方确认", icon: "none" });
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "刷新失败", icon: "none" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="page-shell">
      <Header stage={stage} />
      <ScrollView className="content" scrollY enhanced showScrollbar={false}>
        {stage === "WELCOME" && (
          <View className="screen welcome-screen">
            <Text className="eyebrow">当普通聊天失效</Text>
            <View className="hero-title">换一个空间，{`\n`}把话<Text className="accent">说开</Text>。</View>
            <Text className="lead">AI 不替你判断谁对谁错。它只帮助两个人慢下来，把事实、理解、感受和请求分开。</Text>
            <Button className="primary full" loading={busy} onClick={createRoom}>发起一次沟通</Button>
            <View className="join-box">
              <Input
                className="code-input"
                maxlength={7}
                placeholder="输入 7 位房间码"
                value={joinCode}
                onInput={(event) => setJoinCode(event.detail.value.toUpperCase())}
              />
              <Button className="secondary" onClick={joinRoom}>加入</Button>
            </View>
            <View className="trust"><Text>私人草稿默认仅自己可见</Text><Text>确认后才进入共同空间</Text></View>
          </View>
        )}

        {stage === "GOAL" && (
          <View className="screen">
            <Text className="eyebrow">先确认意图</Text>
            <Text className="title">这次，你最希望发生什么？</Text>
            <Text className="description">先选一个方向。它会成为 AI 引导你表达时的边界。</Text>
            <View className="option-list">
              {goals.map((item) => (
                <Button className={`option ${goal === item ? "selected" : ""}`} key={item} onClick={() => setGoal(item)}>
                  <Text className="radio" /><Text>{item}</Text>
                </Button>
              ))}
            </View>
          </View>
        )}

        {stage === "RECORD" && (
          <View className="screen">
            <Text className="eyebrow">只说你的版本</Text>
            <Text className="title">先把事情说出来。</Text>
            <Text className="description">不用组织得很完美。录音结束后会转成文字，你仍然可以删改。</Text>
            <Button className={`record-button ${recording ? "recording" : ""}`} disabled={busy} onClick={toggleRecording}>
              <Text className="mic">{recording ? "■" : "●"}</Text>
              <Text>{recording ? "正在录音，再点一次结束" : "按下开始说"}</Text>
            </Button>
            <Textarea
              className="transcript"
              maxlength={12000}
              placeholder="也可以直接打字。这里的内容现在只有你能看到。"
              value={transcript}
              onInput={(event) => setTranscript(event.detail.value)}
            />
          </View>
        )}

        {stage === "CLARIFY" && (
          <View className="screen">
            <Text className="eyebrow">先抓住最重要的一点</Text>
            <Text className="title">如果对方只能准确理解一件事，你最希望是哪一件？</Text>
            <View className="ai-card"><Text>可以写下最让你在意的影响，也可以说明怎样的回应会让你觉得自己被听见。</Text></View>
            <Textarea
              className="transcript large"
              maxlength={3000}
              placeholder="用你自己的话回答……"
              value={clarification}
              onInput={(event) => setClarification(event.detail.value)}
            />
          </View>
        )}

        {stage === "REVIEW" && (
          <View className="screen">
            <Text className="eyebrow">发送前由你确认</Text>
            <Text className="title">把你的表达整理成四部分</Text>
            <Text className="description">系统先带入你的原话，请补全并逐项确认。只有这四张卡会分享给对方。</Text>
            <View className="card-list">
              {(["fact", "meaning", "impact", "request"] as const).map((key, index) => (
                <View className={`perspective-card tone-${index}`} key={key}>
                  <Text className="card-label">{["可观察事实", "我的理解", "对我的影响", "我的请求"][index]}</Text>
                  <Textarea
                    maxlength={1000}
                    value={perspective[key]}
                    onInput={(event) => setPerspective({ ...perspective, [key]: event.detail.value })}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {stage === "INVITE" && (
          <View className="screen invite-screen">
            <Text className="eyebrow">你的部分已经保存</Text>
            <Text className="title">现在，邀请对方讲自己的版本。</Text>
            <View className="room-card">
              <Text>沟通房间码</Text>
              <Text className="room-code">{room?.code}</Text>
              <Text>对方看不到你的原始录音和草稿</Text>
            </View>
            <Button className="primary full" openType="share">微信邀请对方</Button>
            <Button className="secondary refresh" loading={busy} onClick={refreshRoom}>刷新沟通进展</Button>
            <Text className="waiting">对方确认自己的版本后，这里会进入双方共同查看的页面。</Text>
          </View>
        )}

        {stage === "COMMON" && (
          <View className="screen">
            <Text className="eyebrow">看懂彼此</Text>
            <Text className="title">理解，不必同意。</Text>
            <Text className="description">这里只使用双方本人确认过的内容，不包含原始录音和私人草稿。</Text>
            {snapshot?.approvedPerspectives.map((item) => (
              <View className="shared-perspective" key={item.role}>
                <Text className="card-label">{item.role === "A" ? "发起者确认的意思" : "受邀者确认的意思"}</Text>
                <Text>{item.fact}</Text>
                <Text>{item.meaning}</Text>
                <Text>{item.impact}</Text>
                <Text>{item.request}</Text>
              </View>
            ))}
            {snapshot?.sharedView && (
              <View className="shared-view">
                <Text className="card-label">共同点</Text>
                <Text>{snapshot.sharedView.common_ground}</Text>
                <Text className="card-label section-label">仍然不同的地方</Text>
                <Text>{snapshot.sharedView.disagreement}</Text>
                <Text className="card-label section-label">接下来最值得回答的问题</Text>
                <Text>{snapshot.sharedView.core_question}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {stage !== "WELCOME" && stage !== "INVITE" && stage !== "COMMON" && (
        <View className="bottom-bar">
          {canNavigateBack(stage) ? (
            <Button className="back" onClick={() => setStage(previousStage(stage))}>返回修改</Button>
          ) : (
            <View className="back-placeholder" />
          )}
          <Button className="primary next" disabled={!canContinue || busy} loading={busy} onClick={next}>继续</Button>
        </View>
      )}
    </View>
  );
}
