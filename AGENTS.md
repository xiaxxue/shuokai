# 说开仓库交付规则

以下流程对所有代码修改和自动化代理均为强制要求：

1. 从已同步的本地 `main` 创建独立 worktree 和 `codex/*` 功能分支；不得直接在 `main` 开发。
2. 在功能 worktree 中完成实现、测试、构建和代码 review。存在 Critical 或 Required 问题时不得合并。
3. 回到本地 `main` worktree，先执行 `git fetch origin` 和 `git merge --ff-only origin/main`，再合并功能分支。
4. 在本地 `main` 上复核合并结果，然后正常推送 `git push origin main`；禁止 force push。
5. 推送后必须确认本地 `main`、`origin/main` 和 GitHub 提交一致。
6. 测试环境只能从 GitHub `main` 的干净检出部署。使用 `npm run cloudflare:deploy:test:main`；该命令会拒绝功能分支、脏工作区和未推送提交。
7. 不得把功能 worktree 的本地产物直接部署为共享测试环境。需要分支预览时，必须使用与共享测试环境不同的独立资源并明确标注。
8. 生产部署不属于默认流程。只有用户明确授权生产发布时才可执行，并且不得使用测试环境配置替代生产审批。

完整操作说明见 [`docs/development-workflow.md`](docs/development-workflow.md)。
