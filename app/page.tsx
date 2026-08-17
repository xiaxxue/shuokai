import DialogueMechanism from "./components/dialogue-mechanism";

const h5Url = "https://app.shuokai.me";

const useCases = [
  {
    index: "01",
    phrase: "同一件事，越解释越误会",
    detail: "双方都在回应，却一直说不清事实、感受和真正的分歧。",
  },
  {
    index: "02",
    phrase: "有重要的话，想说又怕说坏",
    detail: "想道歉、拒绝、修复关系或提出边界，却不知道怎样开口。",
  },
  {
    index: "03",
    phrase: "需要一起决定，却只剩各自立场",
    detail: "关于出行、消费、生活安排或共同责任，争论代替了真正的商量。",
  },
];

const outcomes = [
  "澄清一场误解",
  "找到双方的共同点",
  "准确地保留分歧",
  "约定一个可以尝试的小行动",
  "同意暂停或结束这次沟通",
];

const privacyRules = [
  ["原始表达", "只属于你", "不会自动共享"],
  ["AI 整理", "由你修改", "不会替你表态"],
  ["进入共同空间", "本人确认", "对方才能看见"],
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
    <div className="perspective-scene" aria-label="两个独立视角在共同理解中相遇" role="img">
      <div className="perspective-field field-left" aria-hidden="true"><span>我的视角</span><b>01</b></div>
      <div className="perspective-field field-right" aria-hidden="true"><span>你的视角</span><b>02</b></div>
      <article className="perspective-card card-left" aria-hidden="true">
        <small>我确认的意思</small>
        <p>“我希望重要决定里<br />有我的位置，<br />而不是最后才知道。”</p>
        <span><i /> 确认后才分享</span>
      </article>
      <article className="perspective-card card-right" aria-hidden="true">
        <small>对方确认的表达</small>
        <p>“我急着做决定，<br />是担心讨论<br />又变成争吵。”</p>
        <span><i /> 由本人确认</span>
      </article>
      <div className="understanding-lens" aria-hidden="true">
        <span>真正的分歧</span>
        <strong>一个在意参与，<br />一个害怕冲突</strong>
        <small>先看懂，再决定</small>
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
          <a href="#why">什么时候用</a>
          <a href="#mechanism">怎么工作</a>
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
        <div className="hero-number" aria-hidden="true">01 / 05</div>
        <div className="hero-copy">
          <p className="kicker">为重要但难开口的对话</p>
          <h1>聊不明白，<br /><em>我们一起说开。</em></h1>
          <p className="hero-description">当一段对话开始重复、误解或升级，先在各自的私密空间把想说的理清，再只把本人确认的意思交给对方。</p>
          <a className="primary-link" href="#mechanism"><span>看看说开如何帮助你们</span><i aria-hidden="true">↘</i></a>
        </div>
        <PerspectiveScene />
        <div className="hero-aside" aria-hidden="true"><span>两个视角</span><i /><span>一个共同空间</span></div>
      </section>

      <div className="signal-strip" aria-hidden="true">
        <span>聊不明白</span><i>→</i><span>打开说开</span><i>→</i><span>各自说清</span><i>→</i><span>看懂彼此</span><i>→</i><span>决定下一步</span>
      </div>

      <section className="friction" id="why">
        <div className="section-intro">
          <p className="section-index">02 / 什么时候需要说开</p>
          <h2>这些时候，继续在聊天框里说，<br /><em>往往只会更乱。</em></h2>
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

      <section className="mechanism" id="mechanism">
        <div className="mechanism-heading">
          <p className="section-index">03 / 说开怎么工作</p>
          <h2>先说清自己，<br />再看懂彼此，<br /><em>最后决定下一步。</em></h2>
          <p>双方先在互不可见的空间表达。只有本人确认的内容才会共享，AI 再帮助找出共同点、可能的误解和真正尚未解决的分歧。</p>
        </div>
        <DialogueMechanism />
      </section>

      <section className="outcomes" aria-labelledby="outcomes-title">
        <div>
          <p className="section-index">04 / 什么才算一次有效沟通</p>
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
          <p className="section-index">05 / 谁能看见什么</p>
          <h2>没有经过你确认的话，<br /><em>不会分享给对方。</em></h2>
          <p>原始表达、草稿和 AI 追问默认只属于你。AI 可以帮助整理，但不能替你表态，也不判断谁对谁错。</p>
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
        <h2>聊不明白的时候，<br /><em>我们一起说开。</em></h2>
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
