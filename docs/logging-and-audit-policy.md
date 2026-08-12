# 「说开」日志与审计政策

版本：v1.0

状态：测试环境执行；公开运营前须完成“上线门禁”

适用范围：H5、微信小程序、Cloudflare Worker / Workers AI、Supabase Auth / API / Postgres

> 本文是工程与运营控制方案，不替代律师对具体业务主体、部署地域和数据跨境安排的判断。

## 1. 目标与原则

日志只用于四件事：定位故障、发现安全事件、审计高风险操作、核算 AI 任务可靠性与成本。日志不得成为用户沟通内容的副本。

1. **最少够用**：只记录“何时、哪个服务、哪个安全事件、结果如何、如何关联”，不记录正文。
2. **服务端可信**：请求 ID 由 Worker 生成；客户端传入的身份、路径和错误描述不能直接成为日志字段。
3. **结构统一**：应用日志使用单行 JSON、固定字段、固定事件名和固定错误码。
4. **内容与日志分离**：私人草稿、双方表达、AI 候选结果属于业务数据；Cloudflare 运行日志只保存元数据。
5. **失败不阻断业务**：日志写入失败不得导致用户请求失败，也不得把内部异常原文返回给用户。
6. **分权访问**：能看业务内容的人不自动获得平台日志权限；能查日志的人也不自动获得数据库正文权限。

## 2. 法律与行业基线

- 2026 年生效的修订《网络安全法》要求网络运营者采取监测、记录网络运行状态和网络安全事件的措施，并按规定留存相关网络日志不少于六个月。
- 《个人信息保护法》第十九条要求个人信息保存期限为实现处理目的所必要的最短时间。因此六个月安全日志应使用最小元数据，不应借此长期保存用户正文、邮箱或会话凭据。
- OWASP 建议认证成功/失败、授权失败、会话失败、输入校验失败、依赖和运行时错误均进入应用日志；同时明确不应直接记录访问令牌、会话标识、密码、密钥和敏感个人信息。
- Cloudflare Workers Logs 支持结构化 JSON、请求日志、异常和自定义日志；实时 `tail` 不提供持久保留。Supabase 已自动提供 Auth、API、Postgres 等平台日志和 Auth 审计日志。

参考：

- [中华人民共和国网络安全法（2025 年修正，2026 年施行）](https://www.cac.gov.cn/2025-12/29/c_1768735112911946.htm)
- [中华人民共和国个人信息保护法](https://www.samr.gov.cn/wljys/gzzd/art/2023/art_3ef1e889c1e644d4b65b5f5c7f432386.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Supabase Logging](https://supabase.com/docs/guides/telemetry/logs)
- [Supabase Auth Audit Logs](https://supabase.com/docs/guides/auth/audit-logs)

## 3. 三类记录必须分开

| 类别 | 例子 | 保存位置 | 是否包含用户内容 |
| --- | --- | --- | --- |
| 运行与安全日志 | HTTP 结果、认证/授权失败、异常、配置缺失、队列消息/批次结果 | Cloudflare Workers Logs、Supabase 平台日志 | 否 |
| AI 任务审计 | 模型、状态、重试、错误码、Token、耗时、安全处置 | Supabase `private.ai_jobs` | 结果字段可能包含结构化业务内容 |
| 业务数据 | 私人草稿、确认后的表达、共同理解 | Supabase 业务表，由现有 RLS/RPC 隔离 | 是 |

`private.ai_jobs` 不是通用日志仓库，不新增前端写入权限，不通过 Data API 向用户开放。

## 4. 应用日志格式

每条日志都是一个 JSON 对象。所有事件都有 `schema_version`、`timestamp`、`service`、
`environment`、`event_name` 和 `level`；HTTP 请求事件另外使用下列关联字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schema_version` | number | 当前固定为 `1` |
| `timestamp` | ISO 8601 string | Worker 写入时间，UTC |
| `service` | string | 固定为 `shuokai-api` |
| `environment` | enum | `test` / `production` / `unknown` |
| `event_name` | enum | 事件名，见下表 |
| `level` | enum | `info` / `warn` / `error` |
| `request_id` | UUID | Worker 为每个 HTTP 请求生成的关联 ID；AI 队列消息沿用该值以串联异步处理 |
| `cloudflare_ray` | string? | 合法格式时记录，用于与 Cloudflare 平台日志关联 |
| `route` | enum | 固定路由名；未知路径只记 `not_found` |
| `method` | enum | 标准 HTTP 方法，未知值只记 `OTHER` |
| `status` | number | HTTP 状态码 |
| `outcome` | enum | `success` / `client_error` / `server_error` |
| `error_code` | string? | 脱敏、稳定、最长 64 字符的机器错误码 |
| `duration_ms` | number | 服务端总耗时 |

示例：

```json
{
  "schema_version": 1,
  "timestamp": "2026-08-12T08:00:00.000Z",
  "service": "shuokai-api",
  "environment": "test",
  "event_name": "request_completed",
  "level": "error",
  "request_id": "7cf310e2-3c39-47e1-a0fe-127bf24dc67a",
  "route": "ai_expression",
  "method": "POST",
  "status": 503,
  "outcome": "server_error",
  "error_code": "AI_QUEUE_UNAVAILABLE",
  "duration_ms": 184
}
```

## 5. 事件目录与级别

| 事件 | 级别规则 | 说明 |
| --- | --- | --- |
| `request_completed` | 2xx/3xx `info`；4xx `warn`；5xx `error` | 每个 Worker API 请求一条 |
| `request_exception` | `error` | 未预期异常；只记异常类别，不记 message/stack |
| `ai_queue_message_completed` | 成功 `info`；重试/丢弃 `warn` | 沿用初始 `request_id`，只记结果、稳定错误码和耗时 |
| `ai_queue_batch_completed` | 无重试 `info`；有重试 `warn` | 只记批量计数和耗时，不记任务 ID 或内容 |
| `ai_queue_batch_failed` | `error` | 批次级异常；由队列运行时继续重试 |

认证事件由 Supabase Auth Audit Logs 记录，不在 H5 重复上报邮箱、密码或 Token。AI 单任务业务状态由 `private.ai_jobs` 记录；Cloudflare 只补充不含任务 ID 的队列运行结果。队列使用的 `request_id` 是随机运维关联值，不写入数据库，也不是用户、房间、会话或 AI job 标识。

## 6. 明确禁止记录的数据

以下内容不得由应用代码主动写入 `console.*`、自定义错误码或前端遥测：

- `Authorization`、access token、refresh token、JWT、Cookie、PKCE verifier；
- 密码、验证码、微信 `code`、`openid`、`unionid`、Supabase secret/service-role key；
- 邮箱、手机号、IP、精确位置、设备唯一标识；
- 房间 ID、用户 ID、AI job ID、数据库内部 ID；
- 私人草稿、录音、转写文本、表达卡正文、共同理解正文、AI prompt 和模型原始输出；
- 完整 URL、查询参数、请求/响应 body、请求/响应 headers；
- 数据库连接串、SQL 原文、第三方异常 message 和 stack trace。

Cloudflare/Supabase 自动生成的平台请求日志可能包含 URL、来源 IP 或 User-Agent 等基础设施元数据；
这些字段不复制进自定义应用日志，并按平台访问控制和安全日志保留规则管理。产品路由和查询参数本身也不得承载邮箱、Token 或沟通正文。

确需调查单个业务对象时，应在 Supabase 受控后台按 RLS/管理员权限查询业务记录，不把对象内容复制到运行日志。

## 7. 保存期限与访问

### 测试阶段

- Cloudflare Workers Logs：使用平台当前保留期，测试环境 100% 采样，禁止放入真实敏感沟通内容。
- Supabase 平台/Auth 日志：使用项目套餐保留期。
- 仅开发负责人和安全负责人访问；排障结束后不下载到个人网盘或聊天工具。

### 公开运营前

- 建立独立、受访问控制的安全日志归档，安全/网络运行日志保留不少于 180 天；到期自动删除。
- 普通调试日志若不属于法定网络安全日志，默认保留 7 天，最长不超过 30 天。
- 通过 Logpush/Log Drain 导出前完成处理者、地域、加密、访问审计和费用评估。
- `private.ai_jobs.result_payload` 与业务内容生命周期一致；任务元数据和结果内容若需不同期限，必须先做独立数据设计和隐私评估，不能直接靠日志策略删行。

当前测试环境尚未配置六个月归档，因此**不得把现状描述为已满足公开运营日志留存要求**。

## 8. 排障流程

1. Worker API 故障从用户网络面板取得响应头 `x-request-id`，不要索取密码或 Token。H5 邮箱登录直连 Supabase，
   不会产生 Worker `x-request-id`，应直接按时间窗口检查 Supabase Auth Logs。
2. 在 Cloudflare Workers Logs 按 `request_id` 查 `request_completed`，确认路由、状态、错误码和耗时。
3. 若为认证问题，在 Supabase Auth Logs 按相同时间窗口检查登录、刷新或退出事件；不要把邮箱贴进工单。
4. 若为数据库问题，在 Supabase API/Postgres Logs 按时间和稳定错误码核对。
5. 若为 AI 问题，用同一个 `request_id` 查 `ai_queue_message_completed`，再看 `ai_queue_batch_*`；确需定位业务任务时，由受权人员按时间窗口在 `private.ai_jobs` 查询任务状态、模型、错误码和耗时。
6. 工单只记录 `request_id`、时间、环境、稳定错误码、影响和处置，不粘贴用户正文。

## 9. 告警建议

测试阶段先观察，不接付费告警。公开运营前至少建立：

- 5 分钟内 5xx 比例异常；
- `SERVICE_NOT_CONFIGURED` / `AI_SERVICE_NOT_CONFIGURED` 出现；
- Supabase 认证失败突增或异常刷新；
- AI 队列持续重试、死信增长、配额耗尽；
- 日志停止写入或归档失败。

告警消息只能包含环境、事件名、请求 ID、错误码和计数，不包含用户内容。

## 10. 上线门禁

- [ ] Cloudflare 与 Supabase 日志访问启用最小权限和多因素认证。
- [ ] 六个月安全日志归档方案经过法律、隐私、地域和费用确认。
- [ ] 自动删除策略已验证，且不会误删仍需履行法定义务的安全日志。
- [ ] 隐私政策告知日志处理目的、种类、保存期限/确定方法和受托处理者。
- [ ] 用测试凭据完成登录失败、RLS 拒绝、AI 队列失败和 5xx 演练。
- [ ] 验证日志中不存在密码、Token、邮箱、房间/任务 ID 和沟通正文。
- [ ] 验证 H5 与 mp-weixin 的业务行为未因日志失败而改变。
