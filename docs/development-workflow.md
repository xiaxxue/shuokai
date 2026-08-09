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

共享测试环境是 `shuokai-supabase-test`。生产 Worker 不在这条流程中，任何生产部署都必须另行获得明确授权。

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
