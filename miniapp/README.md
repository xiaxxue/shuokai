# 说开跨端客户端

同一套 `uni-app + Vue 3 + TypeScript` 代码目前生成两个客户端：

- 微信小程序：`mp-weixin`
- 移动网页：`H5`

当前不包含原生 App。等微信小程序与 H5 的产品闭环稳定后，再复用现有页面和领域逻辑接入 App 平台。

## 本地运行

```bash
npm install

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

本地客户端开发时，微信开发者工具可导入本目录；`project.config.json` 会把小程序目录指向 `dist/build/mp-weixin/`。仓库不提供游客 AppID，联调时必须在开发者工具中选择真实小程序 AppID。云函数体验版交付应导入受保护脚本生成的完整目录，见后文。

## 真实后端

客户端只支持真实测试环境，不提供 mock、游客或模拟参与者回退。缺少必要配置时构建会直接失败。

微信小程序接入真实后端：

```bash
SHUOKAI_WECHAT_CLOUD_ENV=your-real-test-environment-id \
SHUOKAI_WECHAT_APP_ID=wx_your_real_app_id \
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

- 微信登录：通过微信云函数的可信 OPENID 登录，并签发普通 Supabase Auth 用户会话，不在小程序端携带 AppSecret。
- H5 登录：浏览器使用 Supabase 邮箱注册/登录；PKCE 会话保存在本机并自动刷新，退出仅撤销当前本机会话，同时清除本机房间与私人草稿。
- 录音：微信端使用 RecorderManager；H5 使用 MediaRecorder。用户停止录音后才上传，也可以直接输入或修改文字。
- 数据：微信通过 `wx.cloud.callFunction` 调用云函数，再携带用户 JWT 访问现有测试 Worker；H5 仍访问 Worker。Worker 以用户身份访问 Supabase，RLS 继续通过 `auth.uid()` 隔离数据。
- AI：录音由 Cloudflare Worker 转写，任何模型私钥都只存在 Worker Secret。
- 分享：微信使用原生分享能力，H5 使用系统分享面板或复制邀请链接。

微信小程序使用微信云函数入口，不再通过 `uni.request` / `uni.uploadFile` 直接访问外部 API 域名。
`urlCheck` 保持开启。构建必须提供真实 AppID 与 `SHUOKAI_WECHAT_CLOUD_ENV`，缺失时直接失败。

云函数需要配置测试 Supabase URL、publishable key 与服务端 secret key，并确认数据库的
`add_wechat_identity_bridge` migration 已应用。具体部署、权限边界和体验版验收见
[`wechat-cloud/README.md`](../wechat-cloud/README.md)。小程序本身的备案、隐私声明与审核仍需办理。
