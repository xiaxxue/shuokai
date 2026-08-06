import { useEffect, useMemo, useState } from "react";
import { Button, Input, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad, useShareAppMessage } from "@tarojs/taro";
import type { ClientStage } from "../../domain/room-state";
import { clientStageOrder, previousStage } from "../../domain/room-state";
import type { Perspective, RoomSession } from "../../domain/types";
import { loginWithWechat, roomApi, transcribeAudio } from "../../services/api";
import { startRecording, stopRecording } from "../../services/recorder";
import "./index.scss";

const goals = [
  "让我被准确理解",
  "理解对方为什么这样想",
  "找到一个双方都能尝试的下一步",
];

const initialPerspective: Perspective = {
  fact: "对方在周六上午确认计划取消，并在之后告诉了我。",
  meaning: "我把这理解成：共同安排发生变化时，我不是会被提前想到的人。",
  impact: "我感到失落，也更难相信之后的约定。",
  request: "计划可能变化时，先告诉我“还没确定”，不必等到最终取消。",
};

function Header({ stage }: { stage: ClientStage }) {
  const step = Math.max(0, clientStageOrder.indexOf(stage) - 1);
  const total = clientStageOrder.length - 1;
  return (
    <View className="topbar">
      <View>
        <Text className="brand">说开</Text>
        <Text className="brand-en">SHUOKAI</Text>
      </View>
      {stage !== "WELCOME" && <Text className="progress-copy">{Math.min(step + 1, total)} / {total}</Text>}
      <View className="progress-track">
        <View className="progress-fill" style={{ width: `${(step / total) * 100}%` }} />
      </View>
    </View>
  );
}

export default function IndexPage() {
  const [stage, setStage] = useState<ClientStage>("WELCOME");
  const [room, setRoom] = useState<RoomSession | null>(null);
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
    return true;
  }, [clarification, stage, transcript]);

  async function createRoom() {
    setBusy(true);
    try {
      await loginWithWechat();
      const created = await roomApi.create();
      setRoom(created);
      setStage("GOAL");
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
      setStage("RECORD");
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "加入失败", icon: "none" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    try {
      if (!recording) {
        await startRecording();
        setRecording(true);
        return;
      }
      setBusy(true);
      const filePath = await stopRecording();
      setRecording(false);
      setTranscript(await transcribeAudio(filePath));
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
        setStage("REVIEW");
      } else if (stage === "REVIEW") {
        await roomApi.approvePerspective(room.roomId, perspective);
        setStage("INVITE");
      }
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : "请稍后重试", icon: "none" });
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
            <Button className={`record-button ${recording ? "recording" : ""}`} onClick={toggleRecording}>
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
            <Text className="eyebrow">AI 只追问一个问题</Text>
            <Text className="title">如果对方当时提前告诉你“计划可能有变”，最重要的区别是什么？</Text>
            <View className="ai-card"><Text>这不是为了证明谁对，而是为了分清“计划改变”和“没有被提前考虑”是不是同一件事。</Text></View>
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
            <Text className="title">这是 AI 整理的“你的版本”</Text>
            <Text className="description">逐项修改。只有这四张卡会分享给对方，原始录音和草稿不会。</Text>
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
            <Text className="waiting">邀请发出后，你可以先离开。对方确认自己的版本后再通知你。</Text>
          </View>
        )}
      </ScrollView>

      {stage !== "WELCOME" && stage !== "INVITE" && (
        <View className="bottom-bar">
          <Button className="back" onClick={() => setStage(previousStage(stage))}>返回</Button>
          <Button className="primary next" disabled={!canContinue || busy} loading={busy} onClick={next}>继续</Button>
        </View>
      )}
    </View>
  );
}
