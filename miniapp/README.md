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
SHUOKAI_API_BASE_URL=https://your-cloudflare-worker.example.com \
npm run build:mp-weixin
```

H5 接入真实后端：

```bash
cp .env.example .env.local
npm run build:h5
```

H5 与 Cloudflare Worker 一起部署时默认使用同源 API，所以无需填写 `SHUOKAI_API_BASE_URL`；若 H5 和 API 使用不同域名，再显式配置该变量与 Worker 的 `ALLOWED_ORIGINS`。

Supabase 的 publishable key 本来就用于客户端，不是服务端私钥；`service_role`、微信 AppSecret 和 OpenAI API Key 绝不能进入客户端构建。H5 使用邮箱/密码注册登录，Supabase 客户端通过 uni storage 持久化会话并自动刷新 token。若项目要求邮箱确认，需要把 H5 地址加入 Auth Redirect URLs；确认前注册接口不会返回可用会话。

## 两个平台的运行边界

- 微信登录：`uni.login(provider: "weixin")` 获取 code，再由后端交换 openid 并签发 Supabase Auth 会话。
- H5 登录：浏览器使用 Supabase 邮箱注册/登录；PKCE 会话保存在本机并自动刷新，退出仅撤销当前本机会话，同时清除本机房间与私人草稿。
- 录音：微信端使用 RecorderManager；H5 使用 MediaRecorder。用户停止录音后才上传，也可以直接输入或修改文字。
- 数据：客户端只携带用户 JWT 调用 Cloudflare Worker；Worker 以用户身份访问 Supabase，RLS 继续通过 `auth.uid()` 隔离数据。
- AI：录音由 Cloudflare Worker 转写，任何模型私钥都只存在 Worker Secret。
- 分享：微信使用原生分享能力，H5 使用系统分享面板或复制邀请链接。

微信正式发布还需要真实 AppID、微信 AppSecret、已备案的 HTTPS API 域名，并在小程序后台配置 `request` 与 `uploadFile` 合法域名。开发者工具的 `urlCheck` 保持开启，避免把只在本地能工作的网络配置误当成可发布状态。

微信登录只有在以下配置齐备后才算接通：真实 AppID、Worker 的 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`、
Supabase `SUPABASE_SERVICE_ROLE_KEY`，以及已应用的 `add_wechat_identity_bridge` migration。缺少任一项时，
代码可以构建，但不能把 touristappid 或 mock token 当作真实微信认证结果。
