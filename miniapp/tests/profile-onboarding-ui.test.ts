import { describe, expect, it } from "vitest";
import componentSource from "../src/components/ProfileOnboarding.vue?raw";

describe("ProfileOnboarding responsive shell", () => {
  it("keeps one scrolling content region above a persistent primary action", () => {
    const source = componentSource;
    const scroll = source.indexOf('class="sheet-scroll"');
    const header = source.indexOf('class="sheet-head"');
    const body = source.indexOf('class="sheet-body"');
    const actions = source.indexOf('class="sheet-actions"');

    expect(scroll).toBeGreaterThan(-1);
    expect(header).toBeGreaterThan(scroll);
    expect(body).toBeGreaterThan(header);
    expect(actions).toBeGreaterThan(body);
    expect(source).toMatch(/\.sheet-scroll \{[^}]*overflow-y: auto;/s);
    expect(source).not.toMatch(/\.sheet-body \{[^}]*overflow-y:/s);
    expect(source).toMatch(/\.sheet-actions \{[^}]*flex: none;/s);
    expect(source).toMatch(/height: 100dvh;/);
    expect(source).toMatch(/env\(safe-area-inset-top\)/);
    expect(source).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(source).toMatch(/width: min\(560px, calc\(100vw - 64px\)\)/);
  });

  it("gives choices, switches, inputs, and dismissal explicit accessible semantics", () => {
    const source = componentSource;

    expect(source).toContain('aria-describedby="profile-description"');
    expect(source).toContain('aria-label="关闭个人资料并保留草稿"');
    expect(source).toContain(':aria-pressed="draft.responseLength === item.value"');
    expect(source).toContain(':aria-pressed="languagePreset === item.value"');
    expect(source).toContain('aria-label="让私人 AI 参考回答长度偏好"');
    expect(source).toContain('aria-label="让私人 AI 参考常用语言偏好"');
    expect(source).toContain('for="custom-language"');
    expect(source).toContain('aria-required="true"');
    expect(source).toMatch(/\.choice \{[^}]*width: 100%;[^}]*min-height: 52px;/s);
    expect(source).toMatch(/\.preference-switch \{[^}]*min-width: 48px;[^}]*min-height: 48px;/s);
  });

  it("keeps privacy visibility and destructive-clear consequences explicit", () => {
    const source = componentSource;

    expect(source).toContain("只会看到你保存的称呼");
    expect(source).toContain("回答偏好和常用语言只属于你");
    expect(source).toContain("启用的偏好会发送到 Cloudflare Workers AI");
    expect(source).toContain("称呼、房间和历史对话不受影响");
    expect(source).toContain('role="alertdialog"');
    expect(source).toContain("正在保存…");
  });
});
