const productUrl = process.env.SHUOKAI_H5_URL
  ?? "https://shuokai-supabase-test.shuokai.workers.dev/";

const moments = [
  {
    number: "01",
    title: "越解释，越像在辩解",
    copy: "你明明想让对方理解自己，最后却只剩下谁对谁错。",
  },
  {
    number: "02",
    title: "有些话，想说又怕说坏",
    copy: "道歉、拒绝、提出边界——越重要的话，越难找到合适的开头。",
  },
  {
    number: "03",
    title: "同一件事，反复争了很多遍",
    copy: "双方都在回应，却没有真正说清事实、感受和期待。",
  },
];

const steps = [
  {
    number: "一",
    title: "各自说清楚",
    copy: "先在只属于自己的空间里表达。AI 帮你整理，但不会替你下结论。",
    note: "草稿仅自己可见",
  },
  {
    number: "二",
    title: "一起看懂彼此",
    copy: "只有你确认过的内容才会共享。双方先确认理解，再进入回应。",
    note: "理解不等于同意",
  },
  {
    number: "三",
    title: "决定下一步",
    copy: "找到共同点，也可以准确地保留分歧，或约定一个可复盘的小实验。",
    note: "不强迫达成共识",
  },
];

const promises = [
  ["01", "不偷看", "原始语音、私人草稿和 AI 追问，默认只属于你。"],
  ["02", "不代言", "任何 AI 整理都要经过本人修改和确认。"],
  ["03", "不裁判", "AI 不判断谁输谁赢，也不给任何一方贴标签。"],
  ["04", "不强迫", "暂停、保留分歧、体面结束，都是有效结果。"],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="说开官网首页">
          <span className="brand-mark" aria-hidden="true">说</span>
          <span>
            <strong>说开</strong>
            <small>SHUOKAI</small>
          </span>
        </a>

        <nav aria-label="主要导航">
          <a href="#why">为什么说开</a>
          <a href="#how">如何使用</a>
          <a href="#trust">隐私原则</a>
        </nav>

        <a className="header-cta" href={productUrl}>打开说开</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> 当聊天失效</p>
          <h1>有些话，<br />不该在气头上<span>说完。</span></h1>
          <p className="hero-lead">
            先各自说清，再一起看懂。说开帮助两个人准确表达、看见真正的分歧，并决定下一步。
          </p>
          <div className="hero-actions">
            <a className="primary-button" href={productUrl}>
              我先理一理 <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="#how">看看它怎么工作 <span aria-hidden="true">↓</span></a>
          </div>
          <p className="privacy-line"><span aria-hidden="true">●</span> 私人表达默认不共享</p>
        </div>

        <div className="hero-art" role="img" aria-label="说开将两个人分别确认的表达带到共同空间">
          <div className="halo halo-one" />
          <div className="halo halo-two" />
          <article className="letter letter-left">
            <div className="letter-topline"><span>我的版本</span><span>仅自己可见</span></div>
            <p>“我不是想责怪你，<br />我只是希望……”</p>
            <div className="letter-lines"><i /><i /><i /></div>
            <span className="pencil-note">慢慢说，没关系</span>
          </article>
          <article className="letter letter-right">
            <div className="letter-topline"><span>对方的版本</span><span>独立表达</span></div>
            <p>“原来你在意的，<br />和我以为的不一样。”</p>
            <div className="letter-lines"><i /><i /></div>
            <span className="pencil-note">先听懂，再回应</span>
          </article>
          <div className="seal" aria-hidden="true"><span>理解</span><small>≠ 同意</small></div>
          <div className="shared-strip"><span>共同空间</span><strong>两个人都确认后，才放到这里</strong></div>
        </div>

        <p className="hero-side-note">为那些重要，但不容易说的话</p>
      </section>

      <section className="moments" id="why">
        <div className="section-intro">
          <p className="section-kicker">你可能来过这里</p>
          <h2>不是没话说，<br />是原来的方式已经说不明白。</h2>
        </div>
        <div className="moment-list">
          {moments.map((moment) => (
            <article className="moment-card" key={moment.number}>
              <span className="card-number">{moment.number}</span>
              <div>
                <h3>{moment.title}</h3>
                <p>{moment.copy}</p>
              </div>
              <span className="card-arrow" aria-hidden="true">↘</span>
            </article>
          ))}
        </div>
      </section>

      <section className="manifesto">
        <p>说开的目标，不是让谁赢。</p>
        <h2>让每个人的话有机会被<span>准确听见</span>，<br />让不同意见也能被好好放下。</h2>
        <p className="manifesto-sign">理解，不必同意。</p>
      </section>

      <section className="process" id="how">
        <div className="process-heading">
          <p className="section-kicker light">一次说开</p>
          <h2>三步，把对抗<br />变成共同面对问题。</h2>
          <p>不用学习沟通理论，也不用一次把所有话说完。</p>
        </div>

        <div className="step-list">
          {steps.map((step) => (
            <article className="step" key={step.number}>
              <span className="step-number">{step.number}</span>
              <div className="step-copy">
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                <span>{step.note}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="trust" id="trust">
        <div className="trust-heading">
          <p className="section-kicker">安全感不是一句口号</p>
          <h2>你的话，<br />由你决定怎样被听见。</h2>
          <p>说开把边界写进产品流程，而不是藏进很长的用户协议。</p>
        </div>
        <div className="promise-grid">
          {promises.map(([number, title, copy]) => (
            <article className="promise" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="use-cases">
        <p className="section-kicker">从哪一句开始</p>
        <div className="use-case-track" aria-label="说开适用的沟通场景">
          <span>我想认真道个歉</span>
          <span>我们需要一起做个决定</span>
          <span>我想说清自己的边界</span>
          <span>这件事不想再互相误解</span>
        </div>
      </section>

      <section className="closing">
        <div className="closing-note">
          <p>写给一段值得认真对待的关系</p>
          <h2>聊不明白的时候，<br />我们一起<span>说开。</span></h2>
          <a className="primary-button inverse" href={productUrl}>
            开始一次说开 <span aria-hidden="true">↗</span>
          </a>
          <small>加入不代表同意 · 随时可以暂停</small>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark" aria-hidden="true">说</span>
          <span><strong>说开</strong><small>SHUOKAI</small></span>
        </a>
        <p>让人们不只能够联系，也能够相互理解。</p>
        <div><span>© 2026 说开</span><a href="#trust">隐私原则</a></div>
      </footer>
    </main>
  );
}
