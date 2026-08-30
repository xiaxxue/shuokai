"use client";

import { useState } from "react";

type JourneyStage = {
  label: string;
  short: string;
  title: string;
  description: string;
  left: { label: string; body: string; meta: string };
  right: { label: string; body: string; meta: string };
  map: { label: string; value: string; state: "done" | "active" | "open" }[];
  caption: string;
};

const stages: JourneyStage[] = [
  {
    label: "私密整理",
    short: "先把自己说清",
    title: "原话先只属于自己。",
    description: "AI 通过一次关键追问，把混在一起的事实、评价和情绪慢慢拆开；用户始终保留删改权。",
    left: {
      label: "我的私人空间",
      body: "你每次都自己决定，我说什么好像都没用。",
      meta: "原始表达 · 仅自己可见",
    },
    right: {
      label: "对方的私人空间",
      body: "只要谈这件事，我们就会争起来，我只能赶紧做决定。",
      meta: "独立表达 · 互不可见",
    },
    map: [
      { label: "语音或文字表达", value: "分别进行", state: "active" },
      { label: "AI 关键追问", value: "至多一个", state: "open" },
      { label: "对方可见内容", value: "暂无", state: "open" },
    ],
    caption: "AI 先服务每个人的自我表达，不读取另一方的私人草稿",
  },
  {
    label: "表达卡",
    short: "本人确认后分享",
    title: "把指责翻译成可以被听见的表达。",
    description: "AI 按非暴力沟通整理观察、感受、需要和请求；只有本人确认的版本才会进入共同空间。",
    left: {
      label: "我确认的表达卡",
      body: "我希望重要决定里有我的位置，而不是事情结束后才被告知。",
      meta: "观察 · 感受 · 需要 · 请求",
    },
    right: {
      label: "对方确认的表达卡",
      body: "我着急做决定，是担心讨论再次失控，不是觉得你的意见不重要。",
      meta: "由本人修改并确认",
    },
    map: [
      { label: "双方表达卡", value: "已确认", state: "done" },
      { label: "私人原话", value: "不共享", state: "done" },
      { label: "共同空间", value: "已开启", state: "active" },
    ],
    caption: "分享的是本人确认的意思，不是原始录音、草稿或 AI 推测",
  },
  {
    label: "理解地图",
    short: "找到需要聊清的点",
    title: "两张卡汇合成一张共同理解地图。",
    description: "AI 综合双方确认的表达，标出共同点、差异、未回应的请求，并提议下一轮最值得聊清的问题。",
    left: {
      label: "我的核心需要",
      body: "重要决定里，我需要被提前考虑，也需要知道自己的意见有位置。",
      meta: "需要：参与 · 确定感",
    },
    right: {
      label: "对方的核心需要",
      body: "我需要讨论不再升级，也需要保留在不确定时暂缓承诺的空间。",
      meta: "需要：安全 · 自主",
    },
    map: [
      { label: "已互相理解", value: "2 项", state: "done" },
      { label: "仍需聊清", value: "3 项", state: "active" },
      { label: "本轮提议", value: "如何提前商量", state: "active" },
    ],
    caption: "AI 只负责提议讨论问题，双方可以接受、修改、跳过或补充",
  },
  {
    label: "逐题聊开",
    short: "每次只谈一个问题",
    title: "问题不是一次聊完，而是逐个说开。",
    description: "双方围绕一个问题澄清观察、听见感受和需要，再回应请求；每轮结束都更新共同理解地图。",
    left: {
      label: "当前讨论问题",
      body: "计划还不能确定时，怎样通知才算把对方考虑进来？",
      meta: "第 2 轮 · 等待双方确认",
    },
    right: {
      label: "这一轮新增的理解",
      body: "一方在意的不是准确时间，而是在变化发生时不要最后才知道。",
      meta: "由原表达者确认准确",
    },
    map: [
      { label: "澄清观察", value: "完成", state: "done" },
      { label: "确认需要", value: "完成", state: "done" },
      { label: "回应请求", value: "进行中", state: "active" },
    ],
    caption: "没说清就继续这一题，说清后再进入局部行动确认",
  },
  {
    label: "行动与复盘",
    short: "局部结果汇成整体方案",
    title: "每个问题，先留下一个局部结果。",
    description: "双方分别确认能做、部分能做、不能做或需要条件；所有重要问题处理后，AI 再汇总不冲突的整体方案。",
    left: {
      label: "这个问题我能做到",
      body: "计划可能变化时，先告诉你“目前还不确定”，确定后再更新一次。",
      meta: "能做到 · 试行 7 天",
    },
    right: {
      label: "这个问题我不能做到",
      body: "无法承诺每次都给出准确时间，也不接受通过实时定位确认行程。",
      meta: "不能做到 · 边界已保留",
    },
    map: [
      { label: "问题 A", value: "形成局部结果", state: "done" },
      { label: "问题 B", value: "保留分歧", state: "done" },
      { label: "整体方案", value: "等待双方确认", state: "active" },
    ],
    caption: "结果可以是共同约定、保留分歧、暂停或结束；理解不等于同意",
  },
];

export default function DialogueMechanism() {
  const [activeStage, setActiveStage] = useState(0);
  const stage = stages[activeStage];

  return (
    <div className="dialogue-mechanism">
      <div className="stage-tabs" role="group" aria-label="说开完整产品流程">
        {stages.map((item, index) => (
          <button
            aria-controls="mechanism-panel"
            aria-pressed={activeStage === index}
            className={activeStage === index ? "active" : ""}
            key={item.label}
            onClick={() => setActiveStage(index)}
            type="button"
          >
            <span>0{index + 1}</span>
            <strong>{item.label}</strong>
            <small>{item.short}</small>
          </button>
        ))}
      </div>

      <div className={`mechanism-panel stage-${activeStage + 1}`} id="mechanism-panel" aria-live="polite">
        <div className="panel-grid" aria-hidden="true" />
        <header className="mechanism-context">
          <span>0{activeStage + 1} / 05</span>
          <div>
            <h3>{stage.title}</h3>
            <p>{stage.description}</p>
          </div>
        </header>

        <article className="mechanism-voice mechanism-left">
          <span className="voice-owner"><i /> 参与者 A</span>
          <small>{stage.left.label}</small>
          <p>“{stage.left.body}”</p>
          <footer>{stage.left.meta}</footer>
        </article>

        <aside className="understanding-map" aria-label="当前共同理解地图">
          <div className="map-heading"><span>共同理解地图</span><i aria-hidden="true" /></div>
          <ol>
            {stage.map.map((item) => (
              <li className={item.state} key={item.label}>
                <i aria-hidden="true" />
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ol>
          <small>每一轮确认后更新</small>
        </aside>

        <article className="mechanism-voice mechanism-right">
          <span className="voice-owner"><i /> 参与者 B</span>
          <small>{stage.right.label}</small>
          <p>“{stage.right.body}”</p>
          <footer>{stage.right.meta}</footer>
        </article>

        <div className="mechanism-caption"><i aria-hidden="true" /> {stage.caption}</div>
      </div>
    </div>
  );
}
