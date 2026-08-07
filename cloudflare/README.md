# 说开 Cloudflare Worker

这个 Worker 是微信小程序、H5 和未来 App 的统一服务端入口。它负责 HTTP 边界、微信登录、语音转写和调用 Supabase RPC；Supabase 仍是唯一的认证与数据来源，不使用 D1。

同一个 Worker 也托管 `miniapp/dist/build/h5`，因此 H5 默认使用同源 API，不需要开放任意来源的 CORS。

## 本地检查

```bash
npm run cloudflare:test
npm run cloudflare:dev
```

正式 H5 的 dry-run 必须显式提供客户端可公开的 Supabase 配置，避免生成 mock 包后被误部署：

```bash
SHUOKAI_SUPABASE_URL=https://your-project.supabase.co \
SHUOKAI_SUPABASE_PUBLISHABLE_KEY=your-publishable-key \
npm run cloudflare:dry-run
```

## Worker 环境变量

在 Cloudflare Dashboard 或 Wrangler 中配置：

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`（推荐；也兼容旧项目的 `SUPABASE_ANON_KEY`）
- `SUPABASE_SERVICE_ROLE_KEY`（Secret，绝不能进入客户端）
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`（Secret）
- `OPENAI_API_KEY`（Secret）
- `ALLOWED_ORIGINS`（可选，逗号分隔；H5 与 Worker 同域时无需填写）

本地开发先复制 `cloudflare/.dev.vars.example` 为 `cloudflare/.dev.vars`；真实值文件已被 Git 忽略。不要把任何真实密钥写入仓库。

业务 API 与转写入口会从 `Authorization: Bearer <jwt>` 中提取 JWT，并使用 Supabase
`auth.getClaims(jwt)` 按当前项目 signing keys 验证签名与 claims。Worker 仍以同一个用户 JWT 调用
PostgREST RPC，让数据库中的 `auth.uid()` 与 RLS 执行最终资源所有权检查。

## 部署

H5 的 Supabase URL 与 publishable key 会进入浏览器构建，这是正常的；数据库安全由用户 JWT 和 RLS 负责。

```bash
SHUOKAI_SUPABASE_URL=https://your-project.supabase.co \
SHUOKAI_SUPABASE_PUBLISHABLE_KEY=your-publishable-key \
npm run cloudflare:deploy
```

部署完成后，把 Worker 的 HTTPS 域名加入微信小程序的 `request` 和 `uploadFile` 合法域名。微信小程序正式构建时显式指定同一个域名：

```bash
SHUOKAI_API_MODE=live \
SHUOKAI_API_BASE_URL=https://your-worker.example.com \
npm run miniapp:build
```

现有 Supabase Edge Functions 暂时保留作回滚；线上验证完成后再下线，避免两个实现长期漂移。
