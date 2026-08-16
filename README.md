# 说开 SHUOKAI

一个以微信小程序与移动 H5 为客户端、Supabase 为数据层的结构化沟通产品：当普通聊天陷入重复、误解或升级，帮助双方先分别表达，再沿着非暴力沟通的观察、感受、需要、请求四步看见真实分歧。

正式产品代码位于 [`miniapp/`](./miniapp)，使用 `uni-app + Vue 3 + TypeScript`，同一套代码分别构建为微信小程序原生产物和移动 H5。仓库根目录的 Next.js 入口是品牌官网，只介绍产品理念，不复制产品流程；产品正式开放后再连接生产客户端。

## 产品流程

- 选择本次沟通目标
- 语音表达与本地录音预览
- 非暴力沟通四步单卡整理（观察、感受、需要、请求）
- 本人审核并批准观点卡
- 低压力邀请对方加入
- 双方共同视图与分歧定位
- 创建可逆、可复盘的 7 天实验

## 正式客户端架构

```text
uni-app / Vue 3 / TypeScript
  ├─ 微信小程序
  │   ├─ uni.login(weixin) ─────→ Cloudflare Worker
  │   └─ RecorderManager ───────→ Cloudflare Worker ────────→ Workers AI / Whisper
  ├─ 移动 H5
  │   ├─ Supabase 邮箱注册 / 登录（PKCE + 持久会话）
  │   └─ MediaRecorder ─────────→ Cloudflare Worker ────────→ Workers AI / Whisper
  └─ HTTPS + Supabase JWT ─────→ Cloudflare Worker ─→ PostgREST RPC ─→ Postgres + RLS
```

- 微信 `code` 和 AppSecret 只在服务端交换，`openid` 不发送给业务页面。
- 服务端把微信身份桥接成标准 Supabase Auth 用户，现有 `auth.uid()`、RLS 和状态机无需推倒重写。
- Cloudflare Worker 同时托管 H5、统一 API 和 Workers AI binding；微信 AppSecret 与 Supabase secret key 均只存在于 Worker。
- 微信录音使用 RecorderManager，H5 使用浏览器 MediaRecorder；录音停止后才上传，转写结果仍须本人修改和批准。
- Supabase 是唯一数据源，不引入 D1；现有 Edge Functions 暂时只作迁移回滚。

## Supabase 后端能力

- Supabase Postgres 持久化房间、参与者、私人草稿、批准后的观点卡、共同视图与约定
- H5 使用邮箱/密码 Supabase Auth 会话；微信小程序使用微信 code 桥接为 Supabase Auth 会话
- RLS 和受控数据库 RPC 同时校验身份、房间角色与合法状态迁移，模型不能直接控制流程
- 原始转写只对所有者可见；共同视图只读取双方批准后的观点卡
- 真实房间码与邀请链接；第二个浏览器可以作为 B 独立加入
- Supabase Realtime 推送房间状态；事件日志记录状态迁移，但不写入原始私人表达

数据库迁移位于 `supabase/migrations/`。浏览器通过公开的 Supabase 客户端密钥调用受限 RPC；项目不包含、也不需要把 `service_role` 密钥发送到前端。

首次部署前，在 Supabase Dashboard 完成以下 Auth 设置：

1. `Authentication → Sign In / Providers → Email` 开启邮箱登录；测试阶段可选择关闭邮箱确认，若开启则确认邮件回跳地址必须在 Redirect URLs 中。
2. `Authentication → URL Configuration` 将 Site URL 和测试 H5 地址加入允许列表。
3. 检查密码策略、Auth Rate Limits 与 leaked password protection；公开测试前配置 CAPTCHA/Cloudflare Turnstile。
4. 不需要开启 Anonymous Sign-Ins；正式 H5 不再自动创建匿名用户。

复制 [`.env.example`](./.env.example)、[`miniapp/.env.example`](./miniapp/.env.example) 和
[`cloudflare/.dev.vars.example`](./cloudflare/.dev.vars.example) 中相应的示例。前端只允许使用
publishable key；Supabase secret key 与微信 AppSecret 只允许进入 Worker Secret。文本 Agent 使用 Cloudflare
托管的 Qwen3 生成候选、Cloudflare 托管的 gpt-oss-120b 独立审查，语音使用 Cloudflare
托管的 Whisper；这些模型都经 Workers AI binding 调用，不需要 OpenAI API Key。

应用数据库变更时按文件名顺序执行 `supabase/migrations/`，先在独立测试项目或 Supabase Branch
验证，再执行 Advisor 与 RLS 隔离测试。不要在未确认环境性质时直接向已有数据的项目 push migration。

## 检查品牌官网

```bash
npm install
npm run dev
```

验证：

```bash
npm run lint
npm test
```

公开官网不会连接共享测试 H5；产品正式开放前，行动按钮显示“产品内测中”。官网本身不包含房间、录音或数据库调用能力。

官网作为独立的 Cloudflare Worker `shuokai-official-site` 部署，不得覆盖承载 H5 与 API 的
`shuokai-ai`。受保护的生产部署入口只接受与 GitHub `main` 完全一致的干净检出，并要求显式确认
`shuokai.me`：

```bash
SHUOKAI_PRODUCTION_DEPLOY_APPROVED=shuokai.me \
npm run cloudflare:deploy:site:production:main
```

## Cloudflare Worker

统一 Worker 的代码、环境变量和部署命令见 [`cloudflare/README.md`](./cloudflare/README.md)。本地安全检查：

```bash
npm run cloudflare:test
SHUOKAI_SUPABASE_URL=https://your-project.supabase.co \
SHUOKAI_SUPABASE_PUBLISHABLE_KEY=your-publishable-key \
npm run cloudflare:dry-run
```

共享测试环境只允许从已推送并与 `origin/main` 完全一致的干净 `main` 检出部署；功能分支不得直接覆盖共享测试环境。完整的 worktree、review、合并、推送和测试部署顺序见 [`docs/development-workflow.md`](./docs/development-workflow.md)。受保护的测试部署入口是：

```bash
npm run cloudflare:deploy:test:main
```

该入口固定使用 `cloudflare/wrangler.test.jsonc`；生产部署不属于默认流程。

## 本地运行跨端客户端

```bash
npm install --prefix miniapp
npm run miniapp:type-check
npm run miniapp:test
```

构建必须提供真实测试环境配置；没有 mock 或游客模式回退。微信 AppID、微信 AppSecret、合法域名与 H5 Supabase 配置见 [`miniapp/README.md`](./miniapp/README.md)。
