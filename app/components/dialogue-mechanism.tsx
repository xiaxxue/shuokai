"use client";

import { useState } from "react";

const stages = [
  {
    label: "说清楚",
    short: "各自在私密空间表达",
    leftTitle: "我的私人空间",
    leftBody: "你每次都自己决定，我说什么好像都没用。",
    leftMeta: "原始表达 · 仅自己可见",
    rightTitle: "对方的私人空间",
    rightBody: "只要谈这件事，我们就会争起来，我只能赶紧做决定。",
    rightMeta: "独立表达 · 互不可见",
    center: "原始表达、草稿和 AI 追问彼此不可见",
  },
  {
    label: "看懂彼此",
    short: "只看本人确认的意思",
    leftTitle: "我确认的版本",
    leftBody: "我希望重要决定里有我的位置，而不是事情结束后才被告知。",
    leftMeta: "本人已修改并确认",
    rightTitle: "对方确认的版本",
    rightBody: "我着急做决定，是担心讨论又失控，不是觉得你的意见不重要。",
    rightMeta: "对方已修改并确认",
    center: "AI 帮助找出共同点、可能的误解和真正的分歧",
  },
  {
    label: "决定下一步",
    short: "形成一个诚实的结果",
    leftTitle: "我们已经说清楚",
    leftBody: "我在意参与决定的过程，你担心讨论再次失控。",
    leftMeta: "共同点与分歧都被保留",
    rightTitle: "一个可以尝试的小约定",
    rightBody: "重要决定开始前，先一起讨论十分钟，再决定是否继续。",
    rightMeta: "双方确认后才成为共同约定",
    center: "也可以保留分歧、暂停或结束这次沟通",
  },
];

export default function DialogueMechanism() {
  const [activeStage, setActiveStage] = useState(0);
  const stage = stages[activeStage];

  return (
    <div className="dialogue-mechanism">
      <div className="stage-tabs" role="group" aria-label="说开的三个阶段：说清楚、看懂彼此、决定下一步">
        {stages.map((item, index) => (
          <button
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
        <article className="mechanism-voice mechanism-left">
          <span className="voice-owner"><i /> 01</span>
          <small>{stage.leftTitle}</small>
          <p>“{stage.leftBody}”</p>
          <footer>{stage.leftMeta}</footer>
        </article>

        <div className="mechanism-bridge" aria-hidden="true">
          <span>SHUOKAI</span><i /><b>{activeStage + 1}</b><i />
        </div>

        <article className="mechanism-voice mechanism-right">
          <span className="voice-owner"><i /> 02</span>
          <small>{stage.rightTitle}</small>
          <p>“{stage.rightBody}”</p>
          <footer>{stage.rightMeta}</footer>
        </article>

        <div className="mechanism-caption"><i /> {stage.center}</div>
      </div>
    </div>
  );
}
