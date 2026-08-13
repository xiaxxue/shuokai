const topicKeys = {
  NVC: "observation",
  FACT_DISPUTE: "claim",
  BOUNDARY: "boundary",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedSentence(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function invitationTopicFromExpression(value: unknown) {
  if (!isRecord(value) || typeof value.mode !== "string" || !isRecord(value.payload)) return "";
  const key = topicKeys[value.mode as keyof typeof topicKeys];
  return key ? boundedSentence(value.payload[key], 180) : "";
}

export function invitationContextFromRecords(snapshot: unknown, expression: unknown) {
  if (!isRecord(snapshot) || !isRecord(snapshot.room) || !isRecord(snapshot.me)) return null;
  if (snapshot.me.role !== "A" && snapshot.me.role !== "B") return null;
  const participants = Array.isArray(snapshot.participants) ? snapshot.participants : [];
  const inviter = participants.find((item) => isRecord(item) && item.role === "A");
  const rawName = isRecord(inviter) ? boundedSentence(inviter.display_name, 60) : "";
  const inviterName = !rawName || rawName === "我" || rawName === "Lin"
    ? "邀请你的人"
    : rawName;
  return {
    inviterName,
    topic: invitationTopicFromExpression(expression),
  };
}
