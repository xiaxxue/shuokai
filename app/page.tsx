import DialogueMechanism from "./components/dialogue-mechanism";

const h5Url = "https://app.shuokai.me";

const useCases = [
  {
    index: "01",
    phrase: "同一件事，越解释越误会",
    detail: "双方都在回应，却把观察、感受、需要和请求混在了一起。",
  },
  {
    index: "02",
    phrase: "有重要的话，想说又怕说坏",
    detail: "想道歉、拒绝、修复关系或提出边界，却不知道怎样开口。",
  },
  {
    index: "03",
    phrase: "需要一起决定，却只剩各自立场",
    detail: "关于生活安排、共同责任或关系期待，争论代替了真正的商量。",
  },
];

const nvcSteps = [
  ["观察", "发生了什么？", "把具体事件与评价分开"],
  ["感受", "这让我怎样？", "不让指责代替真实体验"],
  ["需要", "我在保护什么？", "看见行为背后的在意"],
  ["请求", "我希望怎样做？", "把期待变成可回应的行动"],
];

const capabilities = [
  ["01", "关系背景", "在邀请前说明双方关系、当前状态和沟通偏好，减少被审判感。"],
  ["02", "私密 AI 对话", "支持文字与语音表达、关键追问、自动保存和稍后恢复。"],
  ["03", "非暴力沟通整理", "按观察、感受、需要、请求生成可编辑表达卡，不替用户定性。"],
  ["04", "确认后分享", "只有本人确认的版本进入房间；原话、录音和草稿仍然私密。"],
  ["05", "共同理解地图", "综合双方表达，持续记录共同点、差异、未回应请求与讨论进度。"],
  ["06", "逐题引导沟通", "AI 每次提议一个问题，双方复述、确认、纠正，再进入回应。"],
  ["07", "局部行动结果", "每个问题分别确认能做、部分能做、不能做、需要条件或保留边界。"],
  ["08", "暂停、历史与复盘", "允许安全暂停、恢复完整进度、回看沟通，并在行动后重新评价。"],
];

const outcomes = [
  "我们已经互相听懂",
  "我们准确地保留分歧",
  "我们形成一个可以尝试的小行动",
  "我们决定稍后再继续",
  "我们决定结束这个话题",
];

const productDecisions = [
  {
    title: "不做另一个聊天软件",
    body: "日常联系继续留在微信。说开只承接那些需要慢下来、重新组织和确认的重要沟通。",
  },
  {
    title: "不把共识当作唯一成功",
    body: "理解、分歧、边界、暂停和结束，都可以是一场诚实而有效的沟通结果。",
  },
  {
    title: "不让 AI 替人决定",
    body: "AI 可以整理、提问和提议，但表达、问题、行动与结束方式始终由双方确认。",
  },
];

const privacyRules = [
  ["原始表达", "只属于本人", "不会自动共享"],
  ["AI 整理", "本人修改确认", "不会替用户表态"],
  ["共同内容", "双方分别确认", "输入变化后重新确认"],
  ["行动与边界", "各自独立决定", "拒绝不会被包装成同意"],
];

function Brand() {
  return (
    <span className="brand" aria-label="说开 SHUOKAI">
      <span className="brand-symbol" aria-hidden="true"><i>说</i><i>开</i></span>
      <span className="brand-word"><strong>说开</strong><small>SHUOKAI</small></span>
    </span>
  );
}

function PerspectiveScene() {
  return (
    <div className="perspective-scene" aria-label="两张表达卡汇合成共同理解地图" role="img">
      <div className="perspective-field field-left" aria-hidden="true"><span>我的表达</span><b>01</b></div>
      <div className="perspective-field field-right" aria-hidden="true"><span>对方表达</span><b>02</b></div>
      <article className="perspective-card card-left" aria-hidden="true">
        <small>我确认的表达卡</small>
        <p>“我需要在重要决定里<br />被提前考虑。”</p>
        <span><i /> 观察 · 感受 · 需要 · 请求</span>
      </article>
      <article className="perspective-card card-right" aria-hidden="true">
        <small>对方确认的表达卡</small>
        <p>“我需要讨论不再失控，<br />也需要保留自主。”</p>
        <span><i /> 只分享本人确认版本</span>
      </article>
      <div className="understanding-lens" aria-hidden="true">
        <span>共同理解地图</span>
        <strong>已理解 02<br />待聊清 03</strong>
        <small>每一轮都会更新</small>
      </div>
      <svg className="scene-path" viewBox="0 0 800 620" aria-hidden="true">
        <path d="M75 236C230 236 250 310 400 310S570 384 725 384" />
        <circle cx="75" cy="236" r="5" />
        <circle cx="725" cy="384" r="5" />
      </svg>
    </div>
  );
}

export default function Home() {
  return (
    <main id="top">
      <header className="site-header">
        <a className="brand-link" href="#top" aria-label="返回说开官网首页"><Brand /></a>
        <nav aria-label="主要导航">
          <a href="#method">核心方法</a>
          <a href="#mechanism">完整流程</a>
          <a href="#blueprint">功能全景</a>
          <a href="#privacy">隐私边界</a>
        </nav>
        <a
          className="build-status"
          href={h5Url}
          target="_blank"
          rel="noreferrer"
          aria-label="打开说开 H5；当前版本仍在打磨中"
        >
          <i /> H5 入口 <b aria-hidden="true">↗</b>
        </a>
      </header>

      <section className="hero">
        <div className="hero-number" aria-hidden="true">01 / 08</div>
        <div className="hero-copy">
          <p className="kicker">为重要但难开口的对话</p>
          <h1><span>让复杂的事，</span><br /><em>一点一点说开。</em></h1>
          <p className="hero-description">双方先在各自的私密空间把想说的理清。AI 按非暴力沟通整理表达，再陪双方逐个问题聊开，确认彼此能做什么、不能做什么。</p>
          <div className="hero-actions">
            <a className="primary-link" href="#mechanism"><span>查看完整产品流程</span><i aria-hidden="true">↘</i></a>
            <a className="text-link" href={h5Url} target="_blank" rel="noreferrer">打开 H5 <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <PerspectiveScene />
        <div className="hero-aside" aria-hidden="true"><span>两个视角</span><i /><span>一张持续更新的地图</span></div>
      </section>

      <div className="signal-strip" aria-label="说开的完整流程">
        <span>私密表达</span><i>→</i><span>表达卡</span><i>→</i><span>理解地图</span><i>→</i><span>逐题聊开</span><i>→</i><span>局部结果</span><i>→</i><span>整体方案</span><i>→</i><span>复盘</span>
      </div>

      <section className="friction" id="why">
        <div className="section-intro">
          <p className="section-index">02 / 什么时候需要说开</p>
          <h2>聊不明白的时候，<br />继续在聊天框里说，<br /><em>往往只会更乱。</em></h2>
        </div>
        <div className="friction-grid">
          {useCases.map((point) => (
            <article className="friction-card" key={point.index}>
              <span>{point.index}</span>
              <h3>{point.phrase}</h3>
              <p>{point.detail}</p>
              <i aria-hidden="true">↗</i>
            </article>
          ))}
        </div>
      </section>

      <section className="method" id="method">
        <div className="method-heading">
          <p className="section-index">03 / 核心方法</p>
          <h2>AI 不替你说。<br /><em>它帮你找到真正想说的。</em></h2>
          <p>说开沿用非暴力沟通的基本结构，让复杂事件里的多个问题仍然有一条稳定的理解路径。</p>
        </div>
        <div className="nvc-ribbon">
          {nvcSteps.map(([name, question, detail], index) => (
            <article key={name}>
              <span>0{index + 1}</span>
              <strong>{name}</strong>
              <h3>{question}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        <p className="method-line">观察 · 感受 · 需要 · 请求</p>
      </section>

      <section className="mechanism" id="mechanism">
        <div className="mechanism-heading">
          <p className="section-index">04 / 完整产品流程</p>
          <h2>不是生成一张卡就结束。<br /><em>卡片只是共同沟通的开始。</em></h2>
          <p>点击五个阶段，查看两个人如何从各自表达进入共同理解，再把每一个复杂问题逐项谈清。</p>
        </div>
        <DialogueMechanism />
      </section>

      <section className="blueprint" id="blueprint">
        <div className="blueprint-heading">
          <p className="section-index">05 / 完整产品蓝图</p>
          <h2>从开口之前，<br />陪到行动之后。</h2>
          <p>一间房间保存的不只是聊天记录，而是关系背景、双方表达、理解进展、局部结果与整体行动。</p>
        </div>
        <div className="capability-list">
          {capabilities.map(([index, title, detail]) => (
            <article key={index}>
              <span>{index}</span>
              <h3>{title}</h3>
              <p>{detail}</p>
              <i aria-hidden="true">↗</i>
            </article>
          ))}
        </div>
        <div className="build-note">
          <span>BUILD NOTE · 2026</span>
          <div>
            <strong>当前 H5 已覆盖</strong>
            <p>关系背景、私密 AI 对话、表达卡、邀请、复述确认、共同理解、暂停与历史恢复。</p>
          </div>
          <div>
            <strong>正在继续完善</strong>
            <p>多问题理解地图、每题局部行动结果，以及约定后的复盘闭环。</p>
          </div>
        </div>
      </section>

      <section className="decisions">
        <div className="decisions-heading">
          <p className="section-index">06 / 产品判断</p>
          <h2>说开真正设计的，<br /><em>不是更多消息。</em></h2>
        </div>
        <div className="decision-list">
          {productDecisions.map((decision, index) => (
            <article key={decision.title}>
              <span>0{index + 1}</span>
              <h3>{decision.title}</h3>
              <p>{decision.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="outcomes" aria-labelledby="outcomes-title">
        <div>
          <p className="section-index">07 / 什么才算有效沟通</p>
          <h2 id="outcomes-title">说开的目标，<br />不是强迫和好。<br /><em>是得到一个诚实的结果。</em></h2>
        </div>
        <ol>
          {outcomes.map((outcome, index) => (
            <li key={outcome}><span>0{index + 1}</span><strong>{outcome}</strong></li>
          ))}
        </ol>
      </section>

      <section className="privacy" id="privacy">
        <div className="privacy-copy">
          <p className="section-index">08 / 谁能看见什么</p>
          <h2>没有经过你确认的话，<br /><em>不会分享给对方。</em></h2>
          <p>原始表达、草稿和 AI 追问默认只属于本人。AI 可以帮助整理，但不能替用户表态，也不判断谁对谁错。</p>
        </div>
        <div className="privacy-table" role="table" aria-label="说开的隐私边界">
          <div className="privacy-row privacy-head" role="row">
            <span role="columnheader">内容</span><span role="columnheader">谁来决定</span><span role="columnheader">边界</span>
          </div>
          {privacyRules.map(([content, owner, boundary], index) => (
            <div className="privacy-row" role="row" key={content}>
              <span role="cell"><i>0{index + 1}</i>{content}</span>
              <strong role="cell">{owner}</strong>
              <span role="cell"><b aria-hidden="true">✓</b>{boundary}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="closing">
        <div className="closing-orbit orbit-one" aria-hidden="true" />
        <div className="closing-orbit orbit-two" aria-hidden="true" />
        <p>理解，不必同意。</p>
        <h2>复杂的事，<br /><em>也可以一点一点说开。</em></h2>
        <a className="closing-status" href={h5Url} target="_blank" rel="noreferrer">
          <i /> 打开说开 H5 <b aria-hidden="true">↗</b>
        </a>
        <small>当前仍在打磨；部署完成后，此入口将直接可用</small>
      </section>

      <footer>
        <Brand />
        <p>让人们不只能够联系，<br />也能够相互理解。</p>
        <div><span>© 2026 说开</span><a href="#privacy">隐私边界</a><a href="#top">回到顶部 ↑</a></div>
      </footer>
    </main>
  );
}
