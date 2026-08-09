import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNoticeController,
  SUCCESS_NOTICE_DURATION_MS,
  type Notice,
} from "../src/services/notice";

describe("notice lifecycle", () => {
  afterEach(() => vi.useRealTimers());

  it("automatically dismisses success feedback after a short confirmation", () => {
    vi.useFakeTimers();
    let current: Notice | null = null;
    const notices = createNoticeController((notice) => { current = notice; });

    notices.show("success", "登录成功。");
    vi.advanceTimersByTime(SUCCESS_NOTICE_DURATION_MS - 1);
    expect(current).toEqual({ kind: "success", message: "登录成功。" });

    vi.advanceTimersByTime(1);
    expect(current).toBeNull();
  });

  it("keeps errors visible and prevents an old success timer from hiding them", () => {
    vi.useFakeTimers();
    let current: Notice | null = null;
    const notices = createNoticeController((notice) => { current = notice; });

    notices.show("success", "登录成功。");
    vi.advanceTimersByTime(500);
    notices.show("error", "服务暂时不可用，请稍后再试。");
    vi.advanceTimersByTime(SUCCESS_NOTICE_DURATION_MS);

    expect(current).toEqual({ kind: "error", message: "服务暂时不可用，请稍后再试。" });
  });
});
