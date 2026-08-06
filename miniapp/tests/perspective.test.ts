import { describe, expect, it } from "vitest";
import { perspectiveFromDraft } from "../src/domain/perspective";

describe("perspective draft", () => {
  it("uses the participant's words instead of canned content", () => {
    expect(perspectiveFromDraft("  真实发生的事  ", "  这对我的意义  ")).toEqual({
      fact: "真实发生的事",
      meaning: "这对我的意义",
      impact: "",
      request: "",
    });
  });

  it("keeps generated fields inside the database limit", () => {
    expect(perspectiveFromDraft("a".repeat(1200), "b".repeat(1200)).fact).toHaveLength(1000);
    expect(perspectiveFromDraft("a", "b".repeat(1200)).meaning).toHaveLength(1000);
  });
});
