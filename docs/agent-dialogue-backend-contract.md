# 反思式表达 Agent 后端契约

本文档定义 `UNDERSTAND` 任务的后端输出。前端可以渐进接入新字段；现有
`fields` 与 `uncertainties` 保持兼容。

## 后端编排

```text
用户原话 / 私密回答 / 当前草稿
              │
              ▼
request_understanding_job_v2（版本与输入 hash）
              │  队列里只放 jobId
              ▼
反思式表达 Agent（ASK 或 READY）
              │
              ▼
严格结构、停止策略、grounding 与安全校验
              │
              ▼
私人候选草稿 ── 用户编辑确认 ── public.expression_versions
```

本次只替换表达澄清 Agent。双方表达确认之后的共识 Agent、独立 Review Agent
及引导对话流程保持原有编排，避免同时改动两个阶段。

## 职责边界

- Agent 帮助用户澄清当前愿意表达的内容，不诊断人格、依恋、创伤、疾病或关系性质。
- Agent 每轮先复述，再按需给出一个暂定理解，最多提出一个非诱导问题。
- 第一次调用不强制追问；信息充分时可以直接进入 `READY`。
- 默认最多五轮。达到上限、没有新增信息或存在安全停止条件时不再追问。
- AI 猜测只能进入 `conversation.tentativeUnderstanding`，不得直接进入可分享字段。
- 只有用户最终确认的表达卡会进入 `public.expression_versions`。

## 输出结构

```json
{
  "mode": "NVC",
  "fields": {
    "observation": "周日仍没有收到约定的消息",
    "feeling": "失望",
    "need": "确定感",
    "request": "变化时当天告诉我"
  },
  "uncertainties": ["这次等待里，最影响你的是什么？"],
  "conversation": {
    "state": "ASK",
    "reflection": "你等到周日仍没有消息，这让你很失望。",
    "tentativeUnderstanding": "我不确定，等待本身可能比结果更让你难受。",
    "question": "这次等待里，最影响你的是什么？",
    "questionIntent": "CLARIFY_FEELING",
    "stopReason": "NEEDS_CLARIFICATION"
  },
  "grounding": {
    "observation": { "status": "USER_STATED", "sources": ["SOURCE"] },
    "feeling": { "status": "USER_STATED", "sources": ["SOURCE"] },
    "need": { "status": "MISSING", "sources": [] },
    "request": { "status": "USER_STATED", "sources": ["CURRENT_DRAFT"] }
  },
  "safetyDisposition": "ALLOW",
  "safetyMessage": ""
}
```

`uncertainties` 是兼容字段：`ASK` 时必须只包含 `conversation.question`，`READY`
时必须为空。新前端应优先渲染 `conversation`。

## 对话状态

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `state` | `ASK` | 本轮存在一个会实质改善准确性的问题 |
| `state` | `READY` | 当前内容可以交给用户编辑确认 |
| `stopReason` | `SUFFICIENT_CONTEXT` | 已有信息足够 |
| `stopReason` | `NO_NEW_INFORMATION` | 继续追问不会产生新信息 |
| `stopReason` | `TURN_LIMIT` | 已达到五轮后端上限 |
| `stopReason` | `SAFETY` | 不适合继续普通澄清 |

## 依据状态

- `USER_STATED`：来自用户原话、当前手动草稿或直接回答。
- `USER_CONFIRMED`：用户在后续回答中明确确认；sources 至少包含一个
  `TURN.n.ANSWER`。
- `MISSING`：用户尚未表达。对应字段必须为空，sources 也必须为空。

允许的 source ref 为 `SOURCE`、`CURRENT_DRAFT` 和 `TURN.n.ANSWER`。这些引用只在
私人候选中使用，不随最终表达卡分享。

## 任务版本与幂等

任务使用：

- `pipeline_version = expression-dialogue-v2`
- `prompt_version = reflective-dialogue-v2`

幂等输入同时包含原话 hash、表达路径和当前手动草稿。原话不变但用户修改草稿时，
系统会创建新的模型任务；旧任务完成时会被标记为 `STALE`，不能覆盖新草稿。
