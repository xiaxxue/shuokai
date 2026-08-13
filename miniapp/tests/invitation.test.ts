import { describe, expect, it } from "vitest";
import {
  invitationClarificationMessage,
  parseInvitationContext,
  topicFromEditableExpression,
} from "../src/domain/invitation";
import { createEditableExpression } from "../src/domain/expression";

describe("receiver invitation guidance", () => {
  it("accepts only a bounded inviter label and neutral topic", () => {
    expect(parseInvitationContext({
      inviterName: "邀请你的人",
      topic: "  视频聊天时提到另一个女生好看。  ",
      hiddenDraft: "不得进入客户端状态",
    })).toEqual({
      inviterName: "邀请你的人",
      topic: "视频聊天时提到另一个女生好看。",
    });
    expect(() => parseInvitationContext({ inviterName: "", topic: "某件事" }))
      .toThrow("邀请说明格式无效");
  });

  it("previews only the event-like field from a confirmed expression card", () => {
    const expression = createEditableExpression("NVC");
    expression.fields.observation = "视频聊天时提到另一个女生好看";
    expression.fields.feeling = "难过";
    expression.fields.need = "尊重";
    expression.fields.request = "希望先听我说完";
    expect(topicFromEditableExpression(expression)).toBe("视频聊天时提到另一个女生好看");
  });

  it("creates an honest clarification message instead of pretending it was delivered", () => {
    const message = invitationClarificationMessage({
      inviterName: "邀请你的人",
      topic: "视频聊天时提到另一个女生好看",
    }, "SAY2026");
    expect(message).toContain("房间 SAY2026");
    expect(message).toContain("发生时间、场景或具体行为");
  });
});
