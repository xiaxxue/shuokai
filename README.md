# 说开 SHUOKAI

一个以微信小程序与移动 H5 为客户端、Supabase 为数据层的结构化沟通产品：当普通聊天陷入重复、误解或升级，帮助双方先分别表达，再共同看见事实、理解、影响、请求与真实分歧。

仓库中的 Next.js 页面是可分享的早期作品演示；正式产品代码位于 [`miniapp/`](./miniapp)，使用 `uni-app + Vue 3 + TypeScript`，同一套代码分别构建为微信小程序原生产物和移动 H5。

## 原型覆盖的流程

- 选择本次沟通目标
- 语音表达与本地录音预览
- AI 单问题澄清（模拟内容）
- 本人审核并批准观点卡
- 低压力邀请对方加入
- 双方共同视图与分歧定位
- 创建可逆、可复盘的 7 天实验
- 工程视图展示状态机事件

## 正式客户端架构

```text
uni-app / Vue 3 / TypeScript
  ├─ 微信小程序
  │   ├─ uni.login(weixin) ─────→ Cloudflare Worker
  │   └─ RecorderManager ───────→ Cloudflare Worker ────────→ OpenAI
  ├─ 移动 H5
  │   ├─ Supabase 匿名认证
  │   └─ MediaRecorder ─────────→ Cloudflare Worker ────────→ OpenAI
  └─ HTTPS + Supabase JWT ─────→ Cloudflare Worker ─→ PostgREST RPC ─→ Postgres + RLS
```

- 微信 `code` 和 AppSecret 只在服务端交换，`openid` 不发送给业务页面。
- 服务端把微信身份桥接成标准 Supabase Auth 用户，现有 `auth.uid()`、RLS 和状态机无需推倒重写。
- Cloudflare Worker 同时托管 H5 与统一 API；微信 AppSecret、Supabase service role 和 OpenAI Key 均为 Worker Secret。
- 微信录音使用 RecorderManager，H5 使用浏览器 MediaRecorder；录音停止后才上传，转写结果仍须本人修改和批准。
- Supabase 是唯一数据源，不引入 D1；现有 Edge Functions 暂时只作迁移回滚。

## Supabase 后端能力

- Supabase Postgres 持久化房间、参与者、私人草稿、批准后的观点卡、共同视图与约定
- H5 使用匿名 Supabase Auth 会话；微信小程序使用微信 code 桥接为 Supabase Auth 会话
- RLS 和受控数据库 RPC 同时校验身份、房间角色与合法状态迁移，模型不能直接控制流程
- 原始转写只对所有者可见；共同视图只读取双方批准后的观点卡
- 真实房间码与邀请链接；第二个浏览器可以作为 B 独立加入
- Supabase Realtime 推送房间状态；事件日志记录状态迁移，但不写入原始私人表达

数据库迁移位于 `supabase/migrations/`。浏览器通过公开的 Supabase 客户端密钥调用受限 RPC；项目不包含、也不需要把 `service_role` 密钥发送到前端。

首次部署前，在 Supabase Dashboard 完成以下 Auth 设置：

1. `Authentication → Sign In / Providers` 开启 Anonymous Sign-Ins。
2. `Authentication → URL Configuration` 将 Site URL 设置为 H5 部署域名。
3. 正式公开 H5 前启用 CAPTCHA/Cloudflare Turnstile，并检查 Auth Rate Limits；只有以后增加“匿名账号绑定邮箱”时才需要开启 Manual Linking。

## 本地运行 Web 演示

```bash
npm install
npm run dev
```

验证：

```bash
npm run lint
npm test
```

当前录音仍保留在浏览器本机，不上传服务器。房间、双方批准记录和状态事件会持久化。AI 转写与观点卡生成仍使用演示内容，正式接入模型时会继续沿用同一套“生成—本人修改—本人批准”的权限边界。

## Cloudflare Worker

统一 Worker 的代码、环境变量和部署命令见 [`cloudflare/README.md`](./cloudflare/README.md)。本地安全检查：

```bash
npm run cloudflare:test
npm run cloudflare:dry-run
```

## 本地运行跨端客户端

```bash
npm install --prefix miniapp
npm run miniapp:build
npm run miniapp:build:h5
npm run miniapp:type-check
npm run miniapp:test
```

在微信开发者工具中导入 `miniapp/`。默认使用 `touristappid` 和 mock API；真实联调所需的 AppID、微信 AppSecret、合法域名与 H5 Supabase 配置见 [`miniapp/README.md`](./miniapp/README.md)。
