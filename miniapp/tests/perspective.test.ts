import { describe, expect, it } from "vitest";
import { nvcPerspectiveCards } from "../src/domain/nvc";
import { perspectiveFromDraft } from "../src/domain/perspective";

describe("perspective draft", () => {
  it("uses the four canonical nonviolent communication steps in order", () => {
    expect(nvcPerspectiveCards.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "fact", label: "观察" },
      { key: "meaning", label: "感受" },
      { key: "impact", label: "需要" },
      { key: "request", label: "请求" },
    ]);
  });

  it("uses the participant's words instead of canned content", () => {
    expect(perspectiveFromDraft("  真实发生的事  ", "  我感到难过  ")).toEqual({
      fact: "真实发生的事",
      meaning: "我感到难过",
      impact: "",
      request: "",
    });
  });

  it("keeps generated fields inside the database limit", () => {
    expect(perspectiveFromDraft("a".repeat(1200), "b".repeat(1200)).fact).toHaveLength(1000);
    expect(perspectiveFromDraft("a", "b".repeat(1200)).meaning).toHaveLength(1000);
  });
});
