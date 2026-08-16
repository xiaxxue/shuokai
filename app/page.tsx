const principles = [
  {
    number: "01",
    title: "先各自说清",
    copy: "在自己的空间里慢慢整理。原话、草稿和与 AI 的对话，默认都只属于你。",
  },
  {
    number: "02",
    title: "由本人确认",
    copy: "AI 可以帮助追问和整理，但不能替你表态。只有你认可的版本，才会交给对方。",
  },
  {
    number: "03",
    title: "先确认听懂",
    copy: "回应之前，先复述自己听见了什么。理解对方，不等于放弃自己的立场。",
  },
  {
    number: "04",
    title: "允许没有共识",
    copy: "继续谈、保留分歧或者暂停，都可以是一次诚实沟通的结果。",
  },
];

const boundaries = [
  ["私人空间", "原始录音、草稿和私人 AI 对话不会自动共享。"],
  ["确认之后", "每一段进入共同空间的内容，都经过本人确认。"],
  ["不做裁判", "AI 帮助补全语境，不判断谁更正确，也不制造和解。"],
];

function Brand() {
  return (
    <span className="brand-lockup">
      <span className="brand-seal" aria-hidden="true">说</span>
      <span><strong>说开</strong><small>SHUOKAI</small></span>
    </span>
  );
}

function ConversationRoom() {
  return (
    <div className="conversation-room" role="img" aria-label="两个人分别整理表达，在确认后进入共同空间">
      <div className="room-grid" aria-hidden="true" />
      <article className="voice-card voice-a" aria-hidden="true">
        <div className="voice-meta"><span>我的空间</span><i>01</i></div>
        <p>“我不是想责怪你，<br />只是希望这件事里<br />也有我的位置。”</p>
        <div className="voice-foot"><span>仅自己可见</span><b>已整理</b></div>
      </article>
      <article className="voice-card voice-b" aria-hidden="true">
        <div className="voice-meta"><span>对方的空间</span><i>02</i></div>
        <p>“我以为自己在解决问题，<br />没有意识到，<br />你感到被排除在外。”</p>
        <div className="voice-foot"><span>由对方确认</span><b>已分享</b></div>
      </article>
      <div className="shared-note" aria-hidden="true">
        <span>共同空间</span>
        <strong>我听见了，<br />但我们可以仍然不同意。</strong>
      </div>
      <div className="room-stamp" aria-hidden="true"><span>理解</span><small>≠ 同意</small></div>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a href="#top" aria-label="返回说开官网首页"><Brand /></a>
        <nav aria-label="主要导航">
          <a href="#why">为什么说开</a>
          <a href="#how">如何使用</a>
          <a href="#privacy">隐私边界</a>
        </nav>
        <span className="release-status"><i /> H5 正式版打磨中</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span>FOR CONVERSATIONS THAT MATTER</span></p>
          <h1>有些话，<br />不是不想说。<br /><em>是怕又说错。</em></h1>
          <p className="hero-lead">说开为两个人留出一个更慢的空间：先各自表达，再确认彼此听见了什么。不是为了说服，而是为了不再猜。</p>
          <a className="hero-link" href="#how">看看说开怎么工作 <span aria-hidden="true">↓</span></a>
        </div>
        <ConversationRoom />
        <div className="hero-index" aria-hidden="true"><span>01</span><i /><small>SHUOKAI · 2026</small></div>
      </section>

      <section className="statement" id="why">
        <p className="section-label">为什么需要另一个空间</p>
        <div className="statement-copy">
          <h2>普通聊天要求我们同时<br />表达、倾听、解释，<br />还要保护自己。</h2>
          <div>
            <p>越重要的关系，越容易在一句话里塞进太多东西。我们急着回应，却没来得及确认自己究竟听见了什么。</p>
            <p>说开把这些动作拆开。每一步只做一件事，让沟通不必靠情绪和运气完成。</p>
          </div>
        </div>
      </section>

      <section className="method" id="how">
        <div className="method-heading">
          <p className="section-label">一次说开的路径</p>
          <h2>不教你“正确地沟通”，<br />只让每句话有地方落下。</h2>
        </div>
        <div className="principle-list">
          {principles.map((principle) => (
            <article key={principle.number}>
              <span>{principle.number}</span>
              <h3>{principle.title}</h3>
              <p>{principle.copy}</p>
              <i aria-hidden="true">↘</i>
            </article>
          ))}
        </div>
      </section>

      <section className="interlude" aria-label="说开的产品原则">
        <p>准确地听见一个人，</p>
        <p>比立刻给出答案更重要。</p>
        <span>理解，不必同意。</span>
      </section>

      <section className="privacy" id="privacy">
        <div className="privacy-heading">
          <p className="section-label">边界不是附加功能</p>
          <h2>你的话，<br />始终由你决定<br />怎样被听见。</h2>
          <p>安全感不会藏在很长的协议里。什么时候只有自己能看见，什么时候分享给对方，产品会在每一步明确说明。</p>
        </div>
        <div className="boundary-list">
          {boundaries.map(([title, copy], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <div><h3>{title}</h3><p>{copy}</p></div>
              <i aria-hidden="true">✓</i>
            </article>
          ))}
        </div>
      </section>

      <section className="release">
        <div className="release-orbit" aria-hidden="true" />
        <div className="release-copy">
          <p className="section-label">COMING WHEN IT IS READY</p>
          <h2>我们正在把 H5<br />认真做完。</h2>
          <p>体验入口会在核心流程稳定、隐私边界验证完成后开放。现在不需要注册，也没有测试链接需要尝试。</p>
          <span className="release-button" aria-disabled="true"><i /> 正式版打磨中</span>
        </div>
        <div className="release-mark" aria-hidden="true">开</div>
      </section>

      <footer>
        <Brand />
        <p>让人们不只能够联系，<br />也能够相互理解。</p>
        <div><span>© 2026 说开</span><a href="#privacy">隐私边界</a><a href="#top">回到顶部 ↑</a></div>
      </footer>
    </main>
  );
}
