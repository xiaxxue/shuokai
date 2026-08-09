import type { Perspective } from "./types";
import type { ClientStage } from "./room-state";

export type NvcClientStage = Extract<
  ClientStage,
  "NVC_OBSERVATION" | "NVC_FEELING" | "NVC_NEED" | "NVC_REQUEST"
>;

export type NvcPerspectiveCard = {
  key: keyof Perspective;
  stage: NvcClientStage;
  label: "观察" | "感受" | "需要" | "请求";
  question: string;
  stem: string;
  guide: string;
  placeholder: string;
};

export const nvcPerspectiveCards: readonly NvcPerspectiveCard[] = [
  {
    key: "fact",
    stage: "NVC_OBSERVATION",
    label: "观察",
    question: "如果只描述发生了什么，你会怎么说？",
    stem: "当我看到 / 听到……",
    guide: "只写摄像机能够记录的事情，不使用“总是”“从不”或人格评价。",
    placeholder: "例如：我们约好周五确认，但到周日我仍没有收到消息。",
  },
  {
    key: "meaning",
    stage: "NVC_FEELING",
    label: "感受",
    question: "当这件事发生时，你有什么感受？",
    stem: "我感到……",
    guide: "写下真实感受，而不是对对方的判断；如焦虑、失望、难过或安心。",
    placeholder: "例如：我感到焦虑、失望，也有些无助。",
  },
  {
    key: "impact",
    stage: "NVC_NEED",
    label: "需要",
    question: "这些感受在提醒你重视什么？",
    stem: "因为我看重 / 需要……",
    guide: "说清感受背后普遍的人类需要，不把要求对方采取某种行动写成需要。",
    placeholder: "例如：因为我需要确定感，也看重及时、坦诚的信息。",
  },
  {
    key: "request",
    stage: "NVC_REQUEST",
    label: "请求",
    question: "此刻，你想提出什么具体请求？",
    stem: "你是否愿意……",
    guide: "提出具体、正向、此刻可执行且允许对方说“不”的行动请求。",
    placeholder: "例如：下次进度有变化时，你是否愿意当天告诉我？",
  },
];

export function nvcCardForStage(stage: ClientStage) {
  return nvcPerspectiveCards.find((card) => card.stage === stage) ?? null;
}

export function nvcStageForKey(key: keyof Perspective) {
  return nvcPerspectiveCards.find((card) => card.key === key)?.stage ?? "NVC_OBSERVATION";
}

export function nextNvcStage(stage: NvcClientStage) {
  const index = nvcPerspectiveCards.findIndex((card) => card.stage === stage);
  return nvcPerspectiveCards[index + 1]?.stage ?? null;
}
