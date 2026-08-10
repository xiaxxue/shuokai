export const expressionModes = ["NVC", "FACT_DISPUTE", "BOUNDARY", "PAUSE"] as const;

export type ExpressionMode = typeof expressionModes[number];

export type SafetyDisposition = "ALLOW" | "WARN" | "BLOCK_SHARE" | "PAUSE";

export type ExpressionField = {
  key: string;
  label: string;
  prompt: string;
  placeholder: string;
};

export type ExpressionModeOption = {
  mode: ExpressionMode;
  title: string;
  shortTitle: string;
  description: string;
  accent: string;
  fields: readonly ExpressionField[];
};

export type EditableExpression = {
  mode: ExpressionMode;
  fields: Record<string, string>;
  uncertainties: string[];
  safetyDisposition: SafetyDisposition;
  safetyMessage: string;
};

const nvcFields: readonly ExpressionField[] = [
  {
    key: "observation",
    label: "观察",
    prompt: "如果只写摄像机能记录的事，发生了什么？",
    placeholder: "例如：我们约好周五确认，但到周日我仍没有收到消息。",
  },
  {
    key: "feeling",
    label: "感受",
    prompt: "这件事发生时，你有什么真实感受？",
    placeholder: "例如：我感到焦虑、失望，也有些无助。",
  },
  {
    key: "need",
    label: "需要",
    prompt: "这些感受提醒你重视什么？",
    placeholder: "例如：我需要确定感，也看重及时、坦诚的信息。",
  },
  {
    key: "request",
    label: "请求",
    prompt: "你想提出什么具体、可拒绝的请求？",
    placeholder: "例如：下次进度变化时，你是否愿意当天告诉我？",
  },
];

const factDisputeFields: readonly ExpressionField[] = [
  {
    key: "claim",
    label: "我的主张",
    prompt: "你认为发生了什么？",
    placeholder: "只写你愿意负责的说法，不把推测包装成事实。",
  },
  {
    key: "basis",
    label: "我依据的信息",
    prompt: "哪些信息让你形成这个判断？",
    placeholder: "例如：聊天记录、时间、亲眼看到或亲耳听到的内容。",
  },
  {
    key: "verificationRequest",
    label: "希望核实",
    prompt: "你希望双方一起确认哪一件事？",
    placeholder: "例如：一起查看当天的消息时间，而不是先判断谁在撒谎。",
  },
];

const boundaryFields: readonly ExpressionField[] = [
  {
    key: "boundary",
    label: "我的边界",
    prompt: "什么行为需要停止，或是你不能接受的？",
    placeholder: "例如：我不接受在争吵时查看我的手机。",
  },
  {
    key: "reason",
    label: "我愿意说明的原因",
    prompt: "你愿意让对方理解什么？",
    placeholder: "原因可以简短，也可以留空；边界不需要靠完整解释才成立。",
  },
  {
    key: "acceptableRange",
    label: "可以接受的范围",
    prompt: "什么方式仍然可以沟通？",
    placeholder: "例如：可以直接问我，但需要允许我稍后回答。",
  },
  {
    key: "selfProtectiveAction",
    label: "再次越界时",
    prompt: "你会采取什么自我保护行动？",
    placeholder: "例如：我会结束当次谈话，等双方冷静后再决定是否继续。",
  },
];

export const expressionModeOptions: readonly ExpressionModeOption[] = [
  {
    mode: "NVC",
    title: "非暴力沟通",
    shortTitle: "表达感受与需要",
    description: "用观察、感受、需要、请求，把自己的经历说清楚。",
    accent: "珊瑚",
    fields: nvcFields,
  },
  {
    mode: "FACT_DISPUTE",
    title: "事实争议",
    shortTitle: "保留不同说法",
    description: "整理各自主张和依据，AI 不替任何一方判断真假。",
    accent: "赭石",
    fields: factDisputeFields,
  },
  {
    mode: "BOUNDARY",
    title: "边界声明",
    shortTitle: "清楚说出底线",
    description: "明确什么需要停止、可以接受什么，以及你会如何保护自己。",
    accent: "墨绿",
    fields: boundaryFields,
  },
  {
    mode: "PAUSE",
    title: "暂停或结束",
    shortTitle: "现在先不继续",
    description: "不需要解释原因，也不会进入双方共识生成。",
    accent: "灰蓝",
    fields: [],
  },
];

export function expressionModeOption(mode: ExpressionMode) {
  return expressionModeOptions.find((option) => option.mode === mode) ?? expressionModeOptions[0];
}

export function createEditableExpression(mode: ExpressionMode): EditableExpression {
  return {
    mode,
    fields: Object.fromEntries(expressionModeOption(mode).fields.map((field) => [field.key, ""])),
    uncertainties: [],
    safetyDisposition: "ALLOW",
    safetyMessage: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafetyDisposition(value: unknown): value is SafetyDisposition {
  return value === "ALLOW" || value === "WARN" || value === "BLOCK_SHARE" || value === "PAUSE";
}

export function parseAiExpressionCandidate(value: unknown, expectedMode: ExpressionMode): EditableExpression {
  if (!isRecord(value) || value.mode !== expectedMode || !isRecord(value.fields)) {
    throw new Error("AI 返回的整理结果格式无效，请重试或改为手动填写。");
  }
  const option = expressionModeOption(expectedMode);
  const fields: Record<string, string> = {};
  for (const field of option.fields) {
    const content = value.fields[field.key];
    if (typeof content !== "string" || content.length > 3000) {
      throw new Error("AI 返回的整理结果格式无效，请重试或改为手动填写。");
    }
    fields[field.key] = content;
  }
  const uncertainties = Array.isArray(value.uncertainties) && value.uncertainties.every((item) =>
    typeof item === "string" && item.length <= 500
  ) ? value.uncertainties as string[] : [];
  const safetyDisposition = isSafetyDisposition(value.safetyDisposition)
    ? value.safetyDisposition
    : "WARN";
  const safetyMessage = typeof value.safetyMessage === "string"
    ? value.safetyMessage.slice(0, 1000)
    : "请在分享前再次确认这份整理准确表达了你的意思。";
  return { mode: expectedMode, fields, uncertainties, safetyDisposition, safetyMessage };
}

export function expressionIsComplete(expression: EditableExpression) {
  if (expression.mode === "PAUSE") return true;
  const requiredFields = expressionModeOption(expression.mode).fields.filter((field) =>
    !(expression.mode === "BOUNDARY" && field.key === "reason")
  );
  return requiredFields.every((field) => expression.fields[field.key]?.trim());
}

export function expressionSharePayload(expression: EditableExpression) {
  return {
    mode: expression.mode,
    schemaVersion: 1,
    ...Object.fromEntries(Object.entries(expression.fields).map(([key, value]) => [key, value.trim()])),
    uncertainties: expression.uncertainties.map((item) => item.trim()).filter(Boolean),
  };
}
