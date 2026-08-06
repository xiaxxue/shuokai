# 说开跨端客户端

同一套 `uni-app + Vue 3 + TypeScript` 代码目前生成两个客户端：

- 微信小程序：`mp-weixin`
- 移动网页：`H5`

当前不包含原生 App。等微信小程序与 H5 的产品闭环稳定后，再复用现有页面和领域逻辑接入 App 平台。

## 本地运行

```bash
npm install

# 微信小程序（监听构建）
npm run dev:mp-weixin

# H5（本地开发服务器）
npm run dev:h5
```

生产构建与校验：

```bash
npm run type-check
npm test
npm run build:mp-weixin
npm run build:h5
```

微信开发者工具应导入本目录；`project.config.json` 会把小程序目录指向 `dist/build/mp-weixin/`。提交微信审核前，需要把其中的 `touristappid` 换成真实小程序 AppID。

## Mock 与真实后端

默认构建使用内置 mock 数据，便于本地演示，不会调用线上 AI 或数据库。

微信小程序接入真实后端：

```bash
SHUOKAI_API_MODE=live \
SHUOKAI_API_BASE_URL=https://your-api.example.com \
npm run build:mp-weixin
```

H5 接入真实后端：

```bash
SHUOKAI_API_MODE=live \
SHUOKAI_API_BASE_URL=https://your-api.example.com \
SHUOKAI_SUPABASE_URL=https://your-project.supabase.co \
SHUOKAI_SUPABASE_PUBLISHABLE_KEY=your-publishable-key \
npm run build:h5
```

Supabase 的 publishable key 本来就用于客户端，不是服务端私钥；`service_role`、微信 AppSecret 和 OpenAI API Key 绝不能进入客户端构建。H5 目前使用 Supabase 匿名登录，因此真实上线前需要在 Supabase Authentication 中启用 Anonymous Sign-Ins，并配置防滥用策略。

## 两个平台的运行边界

- 微信登录：`uni.login(provider: "weixin")` 获取 code，再由后端交换 openid 并签发 Supabase Auth 会话。
- H5 登录：浏览器直接使用 Supabase 匿名身份；会话保存在本机，仍受数据库 RLS 隔离。
- 录音：微信端使用 RecorderManager；H5 使用 MediaRecorder。用户停止录音后才上传，也可以直接输入或修改文字。
- 数据：客户端只携带用户 JWT 调用统一 HTTPS API；RLS 继续通过 `auth.uid()` 隔离数据。
- AI：录音由后端转写，任何模型私钥都只存在服务端。
- 分享：微信使用原生分享能力，H5 使用系统分享面板或复制邀请链接。

微信正式发布还需要真实 AppID、微信 AppSecret、已备案的 HTTPS API 域名，并在小程序后台配置 `request` 与 `uploadFile` 合法域名。开发者工具的 `urlCheck` 保持开启，避免把只在本地能工作的网络配置误当成可发布状态。
