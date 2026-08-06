# 说开 SHUOKAI

一个以 Supabase 为后端的结构化沟通产品原型：当普通聊天陷入重复、误解或升级，帮助双方先分别表达，再共同看见事实、理解、影响、请求与真实分歧。

## 原型覆盖的流程

- 选择本次沟通目标
- 语音表达与本地录音预览
- AI 单问题澄清（模拟内容）
- 本人审核并批准观点卡
- 低压力邀请对方加入
- 双方共同视图与分歧定位
- 创建可逆、可复盘的 7 天实验
- 工程视图展示状态机事件

## Supabase 后端能力

- Supabase Postgres 持久化房间、参与者、私人草稿、批准后的观点卡、共同视图与约定
- Supabase Auth 提供无需注册表单的匿名会话，并可通过邮箱确认升级为长期账号
- RLS 和受控数据库 RPC 同时校验身份、房间角色与合法状态迁移，模型不能直接控制流程
- 原始转写只对所有者可见；共同视图只读取双方批准后的观点卡
- 真实房间码与邀请链接；第二个浏览器可以作为 B 独立加入
- Supabase Realtime 推送房间状态；事件日志记录状态迁移，但不写入原始私人表达

数据库迁移位于 `supabase/migrations/`。浏览器通过公开的 Supabase 客户端密钥调用受限 RPC；项目不包含、也不需要把 `service_role` 密钥发送到前端。

首次部署前，在 Supabase Dashboard 完成以下 Auth 设置：

1. `Authentication → Sign In / Providers` 开启 Anonymous Sign-Ins。
2. 同页开启 Manual Linking，让匿名身份可以绑定邮箱。
3. `Authentication → URL Configuration` 将 Site URL 和 Redirect URL 设置为部署域名。

## 本地运行

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
