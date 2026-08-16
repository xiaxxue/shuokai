# 开发、合并与测试部署流程

## 唯一允许的主流程

```text
同步本地 main
  → 新建 worktree / codex/* 分支
  → 开发与本地验证
  → 五轴代码 review
  → 合并到本地 main
  → 在本地 main 复核
  → 推送 GitHub main
  → 确认 GitHub main 提交
  → 从 GitHub main 的干净检出部署测试环境
```

共享测试环境是 `shuokai-supabase-test`。正式 H5 使用独立 Worker `shuokai-ai` 与域名
`app.shuokai.me`。任何生产部署都必须另行获得明确授权。

## 1. 同步本地 main

在本地 `main` worktree 中执行：

```bash
git fetch origin --prune
git merge --ff-only origin/main
```

如果工作区有未提交修改，先确认它们属于谁、是否与本次工作重叠。不得用 reset、checkout 或 clean 删除用户内容。

## 2. 创建独立 worktree

```bash
SHUOKAI_WORKTREE_PATH=/absolute/path/to/new-worktree
git worktree add -b codex/task-name "$SHUOKAI_WORKTREE_PATH" main
```

所有实现和修改都发生在这个 worktree。创建后立即记录实际分支名。

## 3. Review 与验证

提交功能分支前至少执行：

```bash
npm test
npm run lint
npm run cloudflare:type-check
npm run miniapp:type-check
npm --prefix miniapp run build:h5
(cd miniapp && npx uni build -p mp-weixin)
git diff --check
```

Review 必须覆盖正确性、可读性、架构、安全和性能。Critical 或 Required 问题必须在合并前解决。涉及 Supabase 时同时检查：前端只含 publishable/anon key、没有 service-role key、授权仍由现有 RLS/RPC 边界控制。

涉及 `supabase/`、根目录依赖锁文件或数据库测试 workflow 的 Pull Request，会触发
`Supabase Database Tests`。GitHub 托管的临时 Linux runner 会使用锁定版本的 CLI：

1. 启动一套干净的本地 Supabase Postgres；
2. 按顺序应用仓库内全部 migration；
3. 运行 `supabase/tests/` 下全部 pgTAP；
4. 无论成功失败都删除测试数据库。

这条 CI 不需要 Supabase 账号、项目密钥或开发者本机安装 Docker。涉及数据库的
功能分支必须等该检查通过后再合并；不得用共享测试库或生产库代替它。

## 4. 合并本地 main

功能分支提交后，回到本地 `main` worktree：

```bash
git fetch origin --prune
git merge --ff-only origin/main
git merge --no-ff codex/task-name
```

在本地 `main` 上复核合并提交和必要验证。不要在功能 worktree 中用 `HEAD:main` 代替本地 `main` 合并流程。

## 5. 推送 GitHub main

```bash
git push origin main
git fetch origin main
test "$(git rev-parse main)" = "$(git rev-parse origin/main)"
```

只有以上检查成功，GitHub `main` 才能作为部署来源。

## 6. 从 GitHub main 部署测试环境

从 GitHub 新建一个干净检出，安装锁定依赖并执行受保护的部署命令：

```bash
SHUOKAI_DEPLOY_PATH=/absolute/path/to/clean-deploy
git clone --branch main --single-branch https://github.com/xiaxxue/shuokai.git "$SHUOKAI_DEPLOY_PATH"
cd "$SHUOKAI_DEPLOY_PATH"
npm ci
npm --prefix miniapp ci
SHUOKAI_SUPABASE_URL="https://test-project.supabase.co" \
SHUOKAI_SUPABASE_PUBLISHABLE_KEY="test-publishable-key" \
npm run cloudflare:deploy:test:main
```

`cloudflare:deploy:test:main` 会在构建或上传前检查：

- 当前分支必须是 `main`；
- `origin` 必须是 `github.com/xiaxxue/shuokai`；
- 当前 `HEAD` 必须与刚获取的 `origin/main` 完全相同；
- 工作区必须干净；
- H5 构建必须显式提供测试环境使用的 Supabase URL 与 publishable key；
- Wrangler 配置固定为 `cloudflare/wrangler.test.jsonc`。

任一条件不满足都会停止部署。命令不会读取或调用生产 Wrangler 配置。

## 禁止事项

- 不从 `codex/*`、detached HEAD 或未推送提交部署共享测试环境。
- 不把测试部署当作合并或推送 GitHub 的替代步骤。
- 不 force push `main`。
- 不把真实密钥写入仓库、命令日志或构建产物。
- 未获明确授权时不部署生产环境。

## 7. 生产 H5 发布（必须单独授权）

生产 H5 与测试环境不得共享 Supabase 项目、Worker、Queue 或 Secret。首次发布前必须完成：

1. 创建独立生产 Supabase 项目，应用仓库内全部 migration，并通过 pgTAP 与 RLS 检查；
2. 在 Supabase Auth 中把 `https://app.shuokai.me` 加入 Site URL 与 Redirect URLs；
3. 创建 `shuokai-ai-jobs-production` 与 `shuokai-ai-jobs-production-dlq`；
4. 为 `shuokai-ai` 配置唯一的私密 Secret `SUPABASE_SECRET_KEY`；生产 URL 与 publishable key
   由受保护的发布命令同时注入客户端和 Worker，避免两端指向不同项目。若远端曾把
   `SUPABASE_URL` 或 `SUPABASE_PUBLISHABLE_KEY` 保存为 Secret，发布前必须删除，避免遮蔽；
5. 从 GitHub `main` 的干净检出执行受保护命令。

```bash
SHUOKAI_PRODUCTION_DEPLOY_APPROVED="app.shuokai.me" \
SHUOKAI_PRODUCTION_SUPABASE_PROJECT_REF="<production-project-ref>" \
SHUOKAI_SUPABASE_URL="https://<production-project-ref>.supabase.co" \
SHUOKAI_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..." \
npm run cloudflare:deploy:production:main
```

命令会拒绝功能分支、脏工作区、未推送提交、错误 Supabase project ref、客户端 secret key、
缺失 Worker Secrets、错误 Worker 名称、错误 Custom Domain 或测试 Queue。生产数据库密钥不得
写入仓库、`.env` 示例、命令历史、CI 日志或客户端构建产物。

生产 H5 验收完成后，才能部署包含体验入口的新版官网：

```bash
SHUOKAI_PRODUCTION_DEPLOY_APPROVED="shuokai.me" \
SHUOKAI_APP_RELEASE_APPROVED="app.shuokai.me" \
npm run cloudflare:deploy:site:production:main
```
