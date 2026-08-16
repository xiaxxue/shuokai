const appUrl = "https://app.shuokai.me";

const steps = [
  {
    number: "01",
    kicker: "先在自己的空间",
    title: "把真正想说的，慢慢说清楚",
    copy: "可以说、可以写，也可以停下来。AI 只帮你追问遗漏的背景，不替你判断谁对谁错。",
    visual: "private",
  },
  {
    number: "02",
    kicker: "确认以后再分享",
    title: "只有你认可的表达，才会被对方看见",
    copy: "原话、中间草稿和私人 AI 对话都不会自动进入共同空间。你拥有最后的删改权。",
    visual: "card",
  },
  {
    number: "03",
    kicker: "先确认听懂",
    title: "从互相反驳，回到共同面对问题",
    copy: "双方分别确认理解，再回应、保留分歧，或决定暂停。不强迫共识，也不制造和解。",
    visual: "together",
  },
];

const promises = [
  ["私人原话", "默认仅自己可见"],
  ["AI 整理", "必须由本人确认"],
  ["不同意见", "可以准确地保留"],
  ["结束方式", "继续、暂停都有效"],
];

function ProductPreview() {
  return (
    <div className="product-stage" aria-label="说开 H5 产品界面预览">
      <div className="stage-orbit orbit-a" />
      <div className="stage-orbit orbit-b" />
      <div className="stage-word" aria-hidden="true">说</div>

      <article className="phone phone-main">
        <div className="phone-top"><span>9:41</span><i /><span>•••</span></div>
        <div className="phone-screen">
          <div className="app-brand"><strong>说开</strong><small>SHUOKAI</small></div>
          <span className="app-eyebrow">当普通聊天失效</span>
          <h2>换一个空间，<br />把话<span>说开。</span></h2>
          <p>不裁判谁对谁错。先各自表达，再一起看清真正的分歧。</p>
          <div className="preview-button">发起一次沟通 <span>→</span></div>
          <div className="room-entry"><span>已有房间码</span><strong>SAY 2026</strong></div>
          <div className="app-trust"><span>✓</span> 私人草稿默认不共享</div>
        </div>
      </article>

      <article className="phone phone-card">
        <div className="phone-top"><span>9:41</span><i /><span>•••</span></div>
        <div className="phone-screen card-screen">
          <span className="screen-step">02 / 03 · 我的表达</span>
          <h3>我真正想让你<br />听见的是……</h3>
          <div className="expression-field"><span>发生了什么</span><p>我们说好一起决定，但我最后才知道结果。</p></div>
          <div className="expression-field accent-field"><span>我的感受</span><p>我有些失落，也担心自己的意见并不重要。</p></div>
          <div className="share-check"><i>✓</i><span><strong>由我确认后分享</strong><small>原话和 AI 对话仍然保密</small></span></div>
        </div>
      </article>

      <div className="stage-note note-private"><span>01</span> 私人空间</div>
      <div className="stage-note note-shared"><span>02</span> 确认后共享</div>
    </div>
  );
}

function StepVisual({ type }: { type: string }) {
  if (type === "private") {
    return (
      <div className="step-visual private-visual" aria-hidden="true">
        <div className="chat ai">你最希望对方先听懂哪一点？</div>
        <div className="chat me">我不是想责怪，只是不想再被排除在决定之外。</div>
        <span>🔒 只有你和 AI 能看见</span>
      </div>
    );
  }
  if (type === "card") {
    return (
      <div className="step-visual card-visual" aria-hidden="true">
        <span className="mini-label">待本人确认</span>
        <strong>我的表达卡</strong>
        <i /><i /><i className="short" />
        <div className="preview-button">确认这就是我想说的</div>
      </div>
    );
  }
  return (
    <div className="step-visual together-visual" aria-hidden="true">
      <div><span>我听见你在意的是</span><strong>一起做决定</strong></div>
      <b>理解</b>
      <div><span>这不代表我同意</span><strong>但我听懂了</strong></div>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="说开官网首页">
          <span className="brand-mark" aria-hidden="true">说</span>
          <span><strong>说开</strong><small>SHUOKAI</small></span>
        </a>
        <nav aria-label="主要导航">
          <a href="#product">产品体验</a>
          <a href="#how">如何使用</a>
          <a href="#trust">隐私边界</a>
        </nav>
        <a className="header-cta" href={appUrl}>进入说开 <span aria-hidden="true">↗</span></a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="release-pill"><span /> H5 正式版 · 浏览器直接使用</div>
          <h1>不是为了<br />把对方<span>说服。</span></h1>
          <p className="hero-statement">是为了让两个人，都有机会被准确听见。</p>
          <p className="hero-lead">当一段对话开始打转，说开提供一个更慢、更安全的空间：先各自说清，再一起看懂，最后决定下一步。</p>
          <div className="hero-actions">
            <a className="primary-button" href={appUrl}>开始一次说开 <span aria-hidden="true">→</span></a>
            <a className="text-link" href="#product">先看看怎么用</a>
          </div>
          <div className="hero-facts"><span>无需下载 App</span><i /><span>私人表达默认不共享</span></div>
        </div>
        <ProductPreview />
      </section>

      <section className="product-intro" id="product">
        <div className="intro-index"><span>ABOUT</span><strong>不是聊天室<br />是一条沟通路径</strong></div>
        <div className="intro-copy">
          <p>普通聊天常常要求我们同时表达、倾听、解释和保护自己。说开把这些动作拆开，让每一步只做一件事。</p>
          <div><span>各自表达</span><b>→</b><span>确认分享</span><b>→</b><span>互相复述</span><b>→</b><span>决定下一步</span></div>
        </div>
      </section>

      <section className="workflow" id="how">
        <div className="section-heading">
          <p>一次说开</p>
          <h2>把最难聊的部分，<br />拆成三个可以完成的动作。</h2>
        </div>
        <div className="workflow-grid">
          {steps.map((step) => (
            <article className="workflow-card" key={step.number}>
              <div className="card-meta"><span>{step.number}</span><p>{step.kicker}</p></div>
              <h3>{step.title}</h3>
              <p className="workflow-copy">{step.copy}</p>
              <StepVisual type={step.visual} />
            </article>
          ))}
        </div>
      </section>

      <section className="trust" id="trust">
        <div className="trust-copy">
          <p className="section-label">边界写进流程</p>
          <h2>你的话，<br />始终由你决定<br />怎样被听见。</h2>
          <p>说开不会把“安全”藏进很长的协议。什么时候只有你能看见、什么时候会分享给对方，每一步都明确告诉你。</p>
          <a href={appUrl}>亲自体验隐私流程 <span>→</span></a>
        </div>
        <div className="promise-list">
          {promises.map(([title, copy], index) => (
            <article key={title}>
              <span>0{index + 1}</span><div><h3>{title}</h3><p>{copy}</p></div><i>✓</i>
            </article>
          ))}
        </div>
      </section>

      <section className="situations">
        <p>为那些重要，但不容易说的话</p>
        <div className="situation-track">
          <span>认真道一次歉</span><span>说清自己的边界</span><span>一起做一个决定</span><span>停止反复误解</span>
        </div>
      </section>

      <section className="closing">
        <div className="closing-mark" aria-hidden="true">说</div>
        <div>
          <p>理解，不必同意。</p>
          <h2>聊不明白的时候，<br />我们换个方式<span>说开。</span></h2>
          <a className="primary-button light-button" href={appUrl}>进入 H5 正式版 <span>→</span></a>
          <small>无需下载 · 使用邮箱即可开始 · 随时可以暂停</small>
        </div>
      </section>

      <footer>
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">说</span>
          <span><strong>说开</strong><small>SHUOKAI</small></span>
        </a>
        <p>让人们不只能够联系，也能够相互理解。</p>
        <div><span>© 2026 说开</span><a href="#trust">隐私边界</a><a href={appUrl}>打开产品</a></div>
      </footer>
    </main>
  );
}
