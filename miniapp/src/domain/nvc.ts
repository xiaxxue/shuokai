import type { Perspective } from "./types";

export type NvcPerspectiveCard = {
  key: keyof Perspective;
  label: "观察" | "感受" | "需要" | "请求";
  stem: string;
  guide: string;
  placeholder: string;
};

export const nvcPerspectiveCards: readonly NvcPerspectiveCard[] = [
  {
    key: "fact",
    label: "观察",
    stem: "当我看到 / 听到……",
    guide: "只写摄像机能够记录的事情，不使用“总是”“从不”或人格评价。",
    placeholder: "例如：我们约好周五确认，但到周日我仍没有收到消息。",
  },
  {
    key: "meaning",
    label: "感受",
    stem: "我感到……",
    guide: "写下真实感受，而不是对对方的判断；如焦虑、失望、难过或安心。",
    placeholder: "例如：我感到焦虑、失望，也有些无助。",
  },
  {
    key: "impact",
    label: "需要",
    stem: "因为我看重 / 需要……",
    guide: "说清感受背后普遍的人类需要，不把要求对方采取某种行动写成需要。",
    placeholder: "例如：因为我需要确定感，也看重及时、坦诚的信息。",
  },
  {
    key: "request",
    label: "请求",
    stem: "你是否愿意……",
    guide: "提出具体、正向、此刻可执行且允许对方说“不”的行动请求。",
    placeholder: "例如：下次进度有变化时，你是否愿意当天告诉我？",
  },
];
