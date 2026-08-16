import { describe, expect, it } from "vitest";
import { userFacingErrorMessage } from "../src/services/user-facing-error";

describe("user-facing transport errors", () => {
  it.each([
    "request:fail timeout",
    "request:fail network error",
    "Failed to fetch",
    "The operation was aborted",
  ])("never exposes the platform transport message %s", (message) => {
    expect(userFacingErrorMessage(new Error(message), "暂时无法连接，请稍后重试。")).toBe(
      "暂时无法连接，请稍后重试。",
    );
  });

  it("keeps an intentional domain error", () => {
    expect(userFacingErrorMessage(
      new Error("草稿刚刚发生了变化，请刷新后重试。"),
      "操作失败。",
    )).toBe("草稿刚刚发生了变化，请刷新后重试。");
  });
});
