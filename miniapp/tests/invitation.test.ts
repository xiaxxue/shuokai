import { describe, expect, it } from "vitest";
import {
  invitationClarificationMessage,
  invitationTopicCopy,
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

  it("distinguishes loading, empty and failed invitation topics without blaming the inviter", () => {
    expect(invitationTopicCopy("loading", "")).toBe("正在读取这次沟通的主题…");
    expect(invitationTopicCopy("ready", "视频聊天时提到另一个女生好看"))
      .toBe("视频聊天时提到另一个女生好看");
    expect(invitationTopicCopy("ready", "")).toBe("这次邀请暂未显示具体主题");
    expect(invitationTopicCopy("error", "")).toBe("暂时没读到邀请说明");
    expect(invitationTopicCopy("error", "")).not.toContain("邀请方");
    expect(invitationTopicCopy("error", "")).not.toContain("补充");
  });
});
