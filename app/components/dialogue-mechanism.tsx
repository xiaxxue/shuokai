"use client";

import { useState } from "react";

const stages = [
  {
    label: "各自表达",
    short: "只属于自己的原话",
    leftTitle: "我的私人空间",
    leftBody: "你每次都自己决定，我说什么好像都没用。",
    leftMeta: "原始表达 · 仅自己可见",
    rightTitle: "对方的私人空间",
    rightBody: "只要谈这件事，我们就会争起来，我只能赶紧做决定。",
    rightMeta: "独立表达 · 互不可见",
    center: "此时没有任何内容被分享",
  },
  {
    label: "本人确认",
    short: "把指责还原成真正的在意",
    leftTitle: "我确认的版本",
    leftBody: "我希望重要决定里有我的位置，而不是事情结束后才被告知。",
    leftMeta: "本人已修改并确认",
    rightTitle: "对方确认的版本",
    rightBody: "我着急做决定，是担心讨论又失控，不是觉得你的意见不重要。",
    rightMeta: "对方已修改并确认",
    center: "只有确认后的内容准备进入共同空间",
  },
  {
    label: "共同理解",
    short: "先确认听见，再决定下一步",
    leftTitle: "我听见了什么",
    leftBody: "你不是故意忽略我，你是在害怕我们又陷入争吵。",
    leftMeta: "理解已由对方确认",
    rightTitle: "共同空间",
    rightBody: "我们都希望参与决定，只是一个在意过程，一个害怕冲突。",
    rightMeta: "共同点与分歧同时保留",
    center: "理解，不等于同意",
  },
];

export default function DialogueMechanism() {
  const [activeStage, setActiveStage] = useState(0);
  const stage = stages[activeStage];

  return (
    <div className="dialogue-mechanism">
      <div className="stage-tabs" role="group" aria-label="说开的三个阶段">
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
