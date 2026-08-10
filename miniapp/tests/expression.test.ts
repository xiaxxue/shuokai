import { describe, expect, it } from "vitest";
import {
  createEditableExpression,
  expressionIsComplete,
  expressionModeOption,
  expressionModeOptions,
  expressionSharePayload,
  parseAiExpressionCandidate,
} from "../src/domain/expression";

describe("expression modes", () => {
  it("offers the four explicit user-controlled paths", () => {
    expect(expressionModeOptions.map((item) => item.mode)).toEqual([
      "NVC",
      "FACT_DISPUTE",
      "BOUNDARY",
      "PAUSE",
    ]);
    expect(expressionModeOption("FACT_DISPUTE").description).toContain("不替任何一方判断真假");
  });

  it("requires every shareable field except an optional boundary reason", () => {
    const nvc = createEditableExpression("NVC");
    expect(expressionIsComplete(nvc)).toBe(false);
    for (const field of expressionModeOption("NVC").fields) nvc.fields[field.key] = field.label;
    expect(expressionIsComplete(nvc)).toBe(true);

    const boundary = createEditableExpression("BOUNDARY");
    boundary.fields.boundary = "不查看我的手机";
    boundary.fields.acceptableRange = "可以直接询问";
    boundary.fields.selfProtectiveAction = "结束当次谈话";
    expect(expressionIsComplete(boundary)).toBe(true);
    expect(expressionIsComplete(createEditableExpression("PAUSE"))).toBe(true);
  });

  it("parses bounded structured AI output and keeps safety state explicit", () => {
    const parsed = parseAiExpressionCandidate({
      mode: "NVC",
      fields: {
        observation: "周日仍未收到消息",
        feeling: "失望",
        need: "确定感",
        request: "变化时当天告诉我",
      },
      uncertainties: ["是否已经发送但未送达"],
      safetyDisposition: "WARN",
      safetyMessage: "分享前确认场合是否安全。",
    }, "NVC");
    expect(parsed.fields.need).toBe("确定感");
    expect(parsed.safetyDisposition).toBe("WARN");
  });

  it("rejects a result for a different path", () => {
    expect(() => parseAiExpressionCandidate({ mode: "NVC", fields: {} }, "BOUNDARY"))
      .toThrow("格式无效");
  });

  it("builds a share payload without model-only safety metadata", () => {
    const expression = createEditableExpression("FACT_DISPUTE");
    expression.fields.claim = "  对方没有按约定回复  ";
    expression.fields.basis = "聊天记录";
    expression.fields.verificationRequest = "核对发送时间";
    expression.uncertainties = ["  网络是否延迟  ", ""];
    expression.safetyDisposition = "WARN";
    expect(expressionSharePayload(expression)).toEqual({
      mode: "FACT_DISPUTE",
      schemaVersion: 1,
      claim: "对方没有按约定回复",
      basis: "聊天记录",
      verificationRequest: "核对发送时间",
      uncertainties: ["网络是否延迟"],
    });
  });
});
