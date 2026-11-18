# 说开 Cloudflare Worker

这个 Worker 是微信小程序、H5 和未来 App 的统一服务端入口。它负责 HTTP 边界、微信登录、语音转写和调用 Supabase RPC；Supabase 仍是唯一的认证与数据来源，不使用 D1。

同一个 Worker 也托管 `miniapp/dist/build/h5`，因此 H5 默认使用同源 API，不需要开放任意来源的 CORS。

Worker 为每个 API 请求生成 `x-request-id`，并输出隐私最小化的结构化 JSON 日志。请求头、请求体、
用户/房间/任务 ID、凭据和沟通正文禁止进入应用日志。完整字段、保留期和排障流程见
[`docs/logging-and-audit-policy.md`](../docs/logging-and-audit-policy.md)。

## 本地检查

```bash
npm run cloudflare:test
npm run cloudflare:dev
```

正式 H5 的 dry-run 必须显式提供客户端可公开的 Supabase 配置；缺失时构建会失败，不会生成降级包：

```bash
SHUOKAI_SUPABASE_URL=https://your-project.supabase.co \
SHUOKAI_SUPABASE_PUBLISHABLE_KEY=your-publishable-key \
npm run cloudflare:dry-run
```

## Worker 环境变量

在 Cloudflare Dashboard 或 Wrangler 中配置：

- `APP_ENVIRONMENT`（非敏感环境名；配置文件固定为 `test` 或 `production`）
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`（`sb_publishable_…`，仅用于公共客户端请求）
- `SUPABASE_SECRET_KEY`（`sb_secret_…`，仅用于 Worker，绝不能进入客户端）
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`（Secret）
- `ALLOWED_ORIGINS`（可选，逗号分隔；H5 与 Worker 同域时无需填写）

正式 Worker 通过 `TEXT_AI_PROVIDER=opencode` 选择 OpenCode，服务端 Secret
`OPENCODE_API_KEY` 必须先配置；按量接口固定为
`https://opencode.ai/inference/openai/v1/chat/completions`，模型为
`deepseek-v4.1-flash`。表达整理、私人澄清、邀请说明和理解审查均使用该模型。
密钥只保存在 Worker Secret，客户端和微信转发云函数不持有它。
测试配置未设置 provider，继续使用 Workers AI 的 Qwen 生成与 GPT OSS 审查。
语音转写在两个环境中均保留 `@cf/openai/whisper-large-v3-turbo`。

配置为 OpenCode 后，缺少密钥或上游报错会明确失败，不会静默换回其他模型。
OpenCode 调用关闭 thinking，使用标准 JSON Schema；每次请求最多 15 秒，输出仍需通过
现有业务校验和有界修复。网络错误、429 和上游 5xx 可由任务队列重试，原始上游错误不会进入日志。
官方接口与模型资料见 [OpenCode 文档](https://opencode.ai/docs/console/models/)。

本地开发先复制 `cloudflare/.dev.vars.example` 为 `cloudflare/.dev.vars`；真实值文件已被 Git 忽略。不要把任何真实密钥写入仓库。

业务 API 与转写入口会从 `Authorization: Bearer <jwt>` 中提取 JWT，并使用 Supabase
`auth.getClaims(jwt)` 按当前项目 signing keys 验证签名与 claims。Worker 仍以同一个用户 JWT 调用
PostgREST RPC，让数据库中的 `auth.uid()` 与 RLS 执行最终资源所有权检查。

AI 表达整理使用 Cloudflare Queue。测试配置绑定 `shuokai-ai-jobs-test`，消息体只包含 `jobId`；
原始表达由消费者以 Supabase secret key 从私有 schema 读取，不写 Worker 日志。模型调用请求 JSON Schema 输出，结果必须通过本地严格校验；默认不合格时自动修复一次，私人对话允许两次有界自动修复，绝不无限重试或静默切换提供商。生产使用独立的 production Queue / DLQ。

## 部署

H5 的 Supabase URL 与 publishable key 会进入浏览器构建，这是正常的；数据库安全由用户 JWT 和 RLS 负责。

测试环境部署顺序必须是：先在测试 Supabase 应用并通过
`20260810021611_add_ai_expression_v2.sql` 与 pgTAP，再创建测试 Queue / DLQ，最后从干净的 GitHub
`main` 部署 Worker。任一前置项缺失时停止部署；不要把这套配置复制到生产。

```bash
SHUOKAI_SUPABASE_URL=https://your-project.supabase.co \
SHUOKAI_SUPABASE_PUBLISHABLE_KEY=your-publishable-key \
npm run cloudflare:deploy
```

部署完成后，把 Worker 的 HTTPS 域名加入微信小程序的 `request` 和 `uploadFile` 合法域名。微信小程序正式构建时显式指定同一个域名：

```bash
SHUOKAI_API_BASE_URL=https://your-worker.example.com \
npm run miniapp:build
```

现有 Supabase Edge Functions 暂时保留作回滚；其中旧转写函数仍是 OpenAI 实现，活动客户端不得调用它。
线上验证完成后再单独决定是否删除，避免未经确认的破坏性清理。
