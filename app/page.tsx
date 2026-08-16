import DialogueMechanism from "./components/dialogue-mechanism";

const frictionPoints = [
  {
    index: "01",
    phrase: "越解释，越像在辩解",
    detail: "我们急着证明自己没有恶意，却忘了对方最想知道的是：你究竟听见了什么。",
    tone: "warm",
  },
  {
    index: "02",
    phrase: "越重要，越怕说错",
    detail: "道歉、拒绝、边界和共同决定，往往不是没有话，而是不知道从哪一句开始。",
    tone: "cool",
  },
  {
    index: "03",
    phrase: "一直在聊，却没有更靠近",
    detail: "事实、感受和期待混在同一句话里，两个人都回应了，却没人真正被听见。",
    tone: "neutral",
  },
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
        <small>我真正想说的</small>
        <p>“我不是反对你，<br />我只是怕自己<br />又被落下。”</p>
        <span><i /> 仅自己可见</span>
      </article>
      <article className="perspective-card card-right" aria-hidden="true">
        <small>对方确认的表达</small>
        <p>“我急着往前走，<br />没有发现你<br />需要一起决定。”</p>
        <span><i /> 由本人确认</span>
      </article>
      <div className="understanding-lens" aria-hidden="true">
        <span>共同理解</span>
        <strong>你们都在意<br />“被算在里面”</strong>
        <small>理解，不必同意</small>
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
          <a href="#why">为什么</a>
          <a href="#mechanism">怎么工作</a>
          <a href="#privacy">隐私边界</a>
        </nav>
        <span className="build-status"><i /> H5 正式版打磨中</span>
      </header>

      <section className="hero">
        <div className="hero-number" aria-hidden="true">01 / 04</div>
        <div className="hero-copy">
          <p className="kicker">FOR CONVERSATIONS THAT MATTER</p>
          <h1>别急着回答。<br /><em>先把话说开。</em></h1>
          <p className="hero-description">一个帮助两个人分别说清、准确听见，并共同决定下一步的结构化沟通空间。</p>
          <a className="primary-link" href="#mechanism"><span>看看说开怎么工作</span><i aria-hidden="true">↘</i></a>
        </div>
        <PerspectiveScene />
        <div className="hero-aside" aria-hidden="true"><span>两个视角</span><i /><span>一个共同空间</span></div>
      </section>

      <div className="signal-strip" aria-hidden="true">
        <span>各自表达</span><i>→</i><span>本人确认</span><i>→</i><span>确认听懂</span><i>→</i><span>决定下一步</span>
      </div>

      <section className="friction" id="why">
        <div className="section-intro">
          <p className="section-index">02 / WHY SHUOKAI</p>
          <h2>聊天没有坏。<br />只是有些话，<br /><em>承受不了即时回答。</em></h2>
        </div>
        <div className="friction-grid">
          {frictionPoints.map((point) => (
            <article className={`friction-card ${point.tone}`} key={point.index}>
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
          <p className="section-index">03 / HOW IT WORKS</p>
          <h2>不是替你把话说漂亮。<br />是把表达和回应，<br /><em>一次只做一件事。</em></h2>
          <p>点击三个阶段，看看同一句冲突如何从私人表达，经过本人确认，进入两个人都能看见的共同空间。</p>
        </div>
        <DialogueMechanism />
      </section>

      <section className="privacy" id="privacy">
        <div className="privacy-copy">
          <p className="section-index">04 / PRIVACY BY DESIGN</p>
          <h2>你的话，<br />不会比你<br /><em>先到对方面前。</em></h2>
          <p>边界不是附加说明，而是说开每一步的默认设置。AI 可以帮助整理，但分享的决定始终属于表达者本人。</p>
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
        <p>不是每次沟通都要达成共识。</p>
        <h2>但每个人都值得<br /><em>被准确听见。</em></h2>
        <div className="closing-status"><i /> H5 正式版打磨中</div>
        <small>核心流程和隐私边界完成验证后开放</small>
      </section>

      <footer>
        <Brand />
        <p>让人们不只能够联系，<br />也能够相互理解。</p>
        <div><span>© 2026 说开</span><a href="#privacy">隐私边界</a><a href="#top">回到顶部 ↑</a></div>
      </footer>
    </main>
  );
}
