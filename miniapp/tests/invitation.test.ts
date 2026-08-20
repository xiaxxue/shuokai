import { describe, expect, it } from "vitest";
import {
  invitationClarificationMessage,
  invitationContextFromEditableExpression,
  invitationSummaryCopy,
  invitationTitleCopy,
  invitationTopicCopy,
  parseInvitationContext,
  topicFromEditableExpression,
} from "../src/domain/invitation";
import { createEditableExpression, invitationDraftFromExpression } from "../src/domain/expression";

describe("receiver invitation guidance", () => {
  it("accepts only a bounded inviter label and neutral topic", () => {
    expect(parseInvitationContext({
      inviterName: "邀请你的人",
      topic: "  视频聊天时提到另一个女生好看。  ",
      title: "关于视频聊天中的一句话",
      summary: "在一次视频聊天中，发起方想谈谈对方称赞另一个女生这件事。",
      confirmedSummary: true,
      hiddenDraft: "不得进入客户端状态",
    })).toEqual({
      inviterName: "邀请你的人",
      topic: "视频聊天时提到另一个女生好看。",
      title: "关于视频聊天中的一句话",
      summary: "在一次视频聊天中，发起方想谈谈对方称赞另一个女生这件事。",
      confirmedSummary: true,
    });
    expect(() => parseInvitationContext({ inviterName: "", topic: "某件事" }))
      .toThrow("邀请说明格式无效");
  });

  it("keeps old invitation responses readable without pretending AI generated them", () => {
    expect(parseInvitationContext({ inviterName: "邀请你的人", topic: "周日仍未收到消息" }))
      .toEqual({
        inviterName: "邀请你的人",
        topic: "周日仍未收到消息",
        title: "关于这次沟通",
        summary: "发起方确认的背景是：周日仍未收到消息",
        confirmedSummary: false,
      });
  });

  it("previews only the event-like field from a confirmed expression card", () => {
    const expression = createEditableExpression("NVC");
    expression.fields.observation = "视频聊天时提到另一个女生好看";
    expression.fields.feeling = "难过";
    expression.fields.need = "尊重";
    expression.fields.request = "希望先听我说完";
    expression.invitation = invitationDraftFromExpression(expression);
    expect(topicFromEditableExpression(expression)).toBe("视频聊天时提到另一个女生好看");
    expect(invitationContextFromEditableExpression(expression)).toMatchObject({
      title: "想和你谈谈：视频聊天时提到另一个女生好看",
      confirmedSummary: true,
    });
  });

  it("creates an honest clarification message instead of pretending it was delivered", () => {
    const message = invitationClarificationMessage({
      inviterName: "邀请你的人",
      topic: "视频聊天时提到另一个女生好看",
      title: "关于视频聊天中的一句话",
      summary: "发起方想谈谈视频聊天时发生的一件事。",
      confirmedSummary: true,
    }, "SAY2026");
    expect(message).toContain("房间 SAY2026");
    expect(message).toContain("发生时间、场景或具体行为");
  });

  it("labels only an explicit retry as loading and never pretends AI is still generating", () => {
    expect(invitationTitleCopy("idle", "")).toBe("关于这次沟通");
    expect(invitationTitleCopy("loading", "")).toContain("重新读取");
    expect(invitationSummaryCopy("loading", "")).toContain("已经确认");
    expect(invitationSummaryCopy("loading", "")).not.toContain("AI 正在");
    expect(invitationTitleCopy("error", "")).toBe("暂时没读到邀请说明");
    expect(invitationSummaryCopy("error", "")).not.toContain("邀请方要补充");
  });

  it("uses a stable legacy fallback before data arrives and a real loading state only for retry", () => {
    expect(invitationTopicCopy("idle", "")).toBe("这次邀请暂未显示具体主题");
    expect(invitationTopicCopy("loading", "")).toBe("正在重新读取邀请说明…");
    expect(invitationTopicCopy("ready", "视频聊天时提到另一个女生好看"))
      .toBe("视频聊天时提到另一个女生好看");
    expect(invitationTopicCopy("ready", "")).toBe("这次邀请暂未显示具体主题");
    expect(invitationTopicCopy("error", "")).toBe("暂时没读到邀请说明");
    expect(invitationTopicCopy("error", "")).not.toContain("邀请方");
    expect(invitationTopicCopy("error", "")).not.toContain("补充");
  });
});
