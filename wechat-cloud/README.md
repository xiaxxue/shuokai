# 微信云函数入口

微信小程序通过 `wx.cloud.callFunction` 调用指定云函数，不直接请求外部 HTTP 域名。
Supabase 继续管理身份和数据库；对应环境的现有 Worker 继续处理 RPC、AI 和转写。
H5 的连接方式保持不变。

| 环境 | 云函数 | 后端 | Supabase 项目 |
| --- | --- | --- | --- |
| 测试 | `shuokaiGateway` | `shuokai-supabase-test.shuokai.workers.dev` | `pwpcisztfnukjnavszgv` |
| 正式 | `shuokaiGatewayProduction` | `app.shuokai.me` | `jmktnjeefvwailfcrljz` |

函数级环境变量相互独立。运行时同时检查环境、后端和 Supabase URL，配置串用时拒绝请求。

## 身份与权限

- 云函数只接受 `wx-server-sdk.getWXContext()` 提供的 OPENID / APPID，拒绝其他小程序及无微信身份的调用。
- 登录复用 `server/wechat-session.ts` 的 Supabase 身份映射和用户会话签发；不需要微信 AppSecret。
- 业务请求只向该环境的固定 Worker 转发用户 JWT；Worker 继续校验 JWT，Supabase 的 RLS / RPC 继续执行授权。
- 不提供任意 URL 代理，不转发客户端自定义请求头，不打印事件、身份、令牌、录音或沟通正文。
- 录音以有界 base64 请求传入云函数，再转为 multipart 交给原有转写服务。上限为 3 MiB，覆盖客户端两分钟、48kbps 的 MP3；不写云存储。

## 开通测试环境

在微信云开发 / CloudBase 控制台，用当前小程序管理员账号登录并创建独立测试环境。
将真实 AppID 关联到该环境；涉及付费套餐、协议确认时由账号管理员确认。
云函数运行时使用 Node.js 22.21（当前 Supabase SDK 要求 Node.js 22 或以上），超时设为 60 秒，内存 256 MiB。这组配置已在微信体验版环境中保存验证；AI 澄清和语音转写的上游请求最多等待 55 秒，预留时间返回超时提示。免费配额是否覆盖实际使用量，仍需通过端到端测试和费用页确认。

只部署从 GitHub `main` 干净检出生成的交付目录，不能从功能分支上传共享测试代码。

```bash
npm ci
npm --prefix miniapp ci
npm --prefix wechat-cloud ci
npm test
npm run lint
npm run cloudflare:type-check
npm run miniapp:type-check
npm run wechat-cloud:type-check
SHUOKAI_WECHAT_APP_ID=wx_your_real_app_id \
SHUOKAI_WECHAT_CLOUD_ENV=your-real-test-environment-id \
npm run wechat-cloud:prepare:test:main
```

命令先获取 GitHub `main`，拒绝功能分支、错误仓库、脏工作区和未推送提交，然后生成
`dist/wechat-experience-<commit>/`。将这个目录导入微信开发者工具；先上传部署
`cloudfunctions/shuokaiGateway`，使用锁文件安装依赖，再上传小程序代码。
不要将 `wechat-cloud/src` 或整个仓库直接上传为小程序包。

云函数环境变量（不要放进小程序、Git 或截图）：

| 名称 | 值 / 用途 |
| --- | --- |
| `APP_ENVIRONMENT` | `test` |
| `SHUOKAI_BACKEND_URL` | `https://shuokai-supabase-test.shuokai.workers.dev` |
| `WECHAT_APP_ID` | 真实的说开小程序 AppID |
| `SUPABASE_URL` | 与现有测试 Worker 相同的 Supabase 项目 URL |
| `SUPABASE_PUBLISHABLE_KEY` | 该测试项目的 publishable key |
| `SUPABASE_SECRET_KEY` | 该测试项目的服务端 secret key，仅配置于云函数的保密环境变量 |

Supabase 测试库必须已应用仓库的 `add_wechat_identity_bridge` 及后续 migrations。
不要改用管理员密钥执行用户业务 RPC，也不要关闭 RLS。
新环境必须验证能访问现有 Worker 和 Supabase；跨网络访问延迟与可用性需要实测，构建成功不能代替联调。

## 验收

1. 开启域名校验，确认小程序登录、刷新会话成功，控制台没有外部域名校验错误。
2. 创建房间，第二名体验者用原生分享或房间码加入，双方只能读取各自有权查看的数据。
3. 发送文字、执行 AI 整理、停止录音后转写；检查超时与重试提示，确认原话仍保留。
4. 后台版本管理中将本次开发版设为体验版，添加需要参与验证的体验成员。

小程序本身的备案、隐私声明和发布审核仍按微信要求办理。云函数调用免自有 API 域名配置，
不代表其他外部图片 / 下载链接可以绕过微信的域名要求。

## 正式服务的微信体验版

获得用户明确授权后，使用 GitHub `main` 干净检出生成正式交付包：

```bash
SHUOKAI_WECHAT_APP_ID=wx30bafbe48a0f4d4b \
SHUOKAI_WECHAT_CLOUD_ENV=your-real-cloud-environment-id \
SHUOKAI_WECHAT_PRODUCTION_APPROVED=wx30bafbe48a0f4d4b \
SHUOKAI_PRODUCTION_SUPABASE_PROJECT_REF=jmktnjeefvwailfcrljz \
npm run wechat-cloud:prepare:production:main
```

导入 `dist/wechat-production-<commit>/`，上传其中唯一的 `shuokaiGatewayProduction`。
配置 `APP_ENVIRONMENT=production`、`SHUOKAI_BACKEND_URL=https://app.shuokai.me`、真实
`WECHAT_APP_ID`、`SUPABASE_URL=https://jmktnjeefvwailfcrljz.supabase.co`，以及同一个正式项目的
publishable key 和服务端 secret key。服务端密钥只保存于该正式云函数。
脚本拒绝缺少授权、错误正式项目、脏工作区、功能分支和未推送提交；交付包不包含数据库密钥。

正式微信入口复用现有正式 Worker，不会在此命令中重新发布 H5、迁移或复制数据库。
验证微信身份映射函数存在、普通用户授权有效后，再验证建房、加入、AI 和语音。
微信首次登录会建立独立账号；网页账号的历史数据需要另行关联账号才能共用。

官方调用文档：<https://docs.cloudbase.net/en/cloud-function/how-use>

## 依赖审查

锁定官方 `wx-server-sdk@4.0.2`，仅使用初始化与可信上下文读取。
它的数据库 / HTTP 客户端依赖仍有 npm audit 告警；当前入口不调用这些 API，
客户端事件不传入 SDK 配置或数据库操作。后续启用这些能力前必须重新审查相关依赖。
