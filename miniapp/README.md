# 说开微信小程序

这是正式的小程序客户端，不是 H5 WebView。Taro 仅作为编译器与 React 运行层，最终产物是微信小程序的 WXML/WXSS/JavaScript。

## 本地运行

```bash
npm install
npm run build:weapp
```

然后在微信开发者工具中导入本目录。开发者工具会读取 `project.config.json`，小程序根目录是 `dist/`。

默认使用 `touristappid` 和 mock API，方便面试演示。接入真实环境时：

```bash
SHUOKAI_API_MODE=live npm run build:weapp
```

并把 `project.config.json` 的 `appid` 替换为真实小程序 AppID。

## 微信允许的运行边界

- 登录：`wx.login()` → 服务端交换 `openid` → 服务端签发 Supabase Auth 会话。
- 录音：`wx.getRecorderManager()`；用户停止后才上传，发送前可编辑。
- 数据：小程序只调用同一个 HTTPS API 域名；`miniapp-api` 再以用户 JWT 调用 PostgREST RPC，RLS 仍以 `auth.uid()` 做隔离。
- AI：录音上传到服务端，服务端调用 OpenAI；任何私钥都不进入小程序包。
- 分享：使用小程序原生 `open-type="share"`，房间码放在页面 path 中。

生产发布前还需要真实 AppID、微信 AppSecret、已备案的 HTTPS API 域名，以及在小程序后台配置 `request` / `uploadFile` 合法域名。`SHUOKAI_API_BASE_URL` 应指向这个统一 API 域名；登录、刷新会话、数据库命令和录音上传都走该域名，避免要求小程序放行多个第三方域名。

开发者工具配置保持 `urlCheck: true`，不会用“跳过合法域名校验”伪装成可发布状态。若只在本地排查网络问题，可以在开发者工具 UI 中临时关闭校验，但不要提交该设置。
