import { describe, expect, it } from "vitest";
import {
  nextNvcStage,
  nvcCardForStage,
  nvcPerspectiveCards,
  nvcStageForKey,
} from "../src/domain/nvc";
import { createNvcPerspective } from "../src/domain/perspective";

describe("perspective draft", () => {
  it("uses the four canonical nonviolent communication steps in order", () => {
    expect(nvcPerspectiveCards.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "fact", label: "观察" },
      { key: "meaning", label: "感受" },
      { key: "impact", label: "需要" },
      { key: "request", label: "请求" },
    ]);
  });

  it("maps every card to the same four-step guided flow", () => {
    expect(nvcCardForStage("NVC_OBSERVATION")?.key).toBe("fact");
    expect(nextNvcStage("NVC_OBSERVATION")).toBe("NVC_FEELING");
    expect(nextNvcStage("NVC_REQUEST")).toBeNull();
    expect(nvcStageForKey("impact")).toBe("NVC_NEED");
  });

  it("does not mislabel an unstructured expression as an observation", () => {
    expect(createNvcPerspective("  我感到难过  ")).toEqual({
      fact: "",
      meaning: "我感到难过",
      impact: "",
      request: "",
    });
  });

  it("keeps generated fields inside the database limit", () => {
    expect(createNvcPerspective("b".repeat(1200)).meaning).toHaveLength(1000);
  });
});
