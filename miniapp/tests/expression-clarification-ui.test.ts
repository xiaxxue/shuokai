import { describe, expect, it } from "vitest";
import componentSource from "../src/components/ExpressionClarification.vue?raw";
import pageSource from "../src/pages/index/index.vue?raw";

describe("ExpressionClarification direct editor", () => {
  it("opens a separate modal card instead of expanding the conversation card", () => {
    const source = componentSource;
    const expressionCard = source.indexOf('class="expression-card"');
    const composer = source.indexOf('class="composer-dock"');
    const editorLayer = source.indexOf('class="editor-layer"');

    expect(expressionCard).toBeGreaterThan(-1);
    expect(composer).toBeGreaterThan(expressionCard);
    expect(editorLayer).toBeGreaterThan(composer);
    expect(source).not.toContain('v-if="directEditing" class="direct-editor"');
    expect(source).toContain('class="editor-backdrop"');
    expect(source).toContain('class="editor-card"');
    expect(source).toMatch(/\.editor-layer \{[^}]*position: fixed;/s);
    expect(source).toMatch(/\.editor-card \{[^}]*border-radius: 34rpx;/s);
  });

  it("keeps dismissal, draft protection, and accessibility explicit", () => {
    const source = componentSource;

    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-label="暂存修改并关闭编辑卡片"');
    expect(source).toContain("暂存并关闭");
    expect(source).toContain("保存修改");
    expect(source).toContain("修改会自动保留在你的私人草稿中");
    expect(source).toContain("commitBufferedEdits();");
    expect(source).toContain('emit("update-field", key, value);');
    expect(source).toContain('emit("update-invitation", key, value);');
    expect(source).toMatch(/function enterDirectEdit\(\) \{[\s\S]*initializeEditBuffer\(\);[\s\S]*directEditing\.value = true;/);
    expect(source).not.toContain("editBufferReady");
    expect(source).toMatch(/\.editor-close \{[^}]*min-width: 48px;[^}]*min-height: 48px;/s);
    expect(source).toContain("env(safe-area-inset-top)");
    expect(source).toContain("env(safe-area-inset-bottom)");
  });

  it("shows a follow-up below the card only when there is a real question", () => {
    const openCandidate = pageSource.match(
      /function openExpressionCandidate\(\) \{[\s\S]*?\n\}/,
    )?.[0] ?? "";

    expect(componentSource).toContain('v-if="question && !organizationPending" class="message-row assistant"');
    expect(openCandidate).toContain("expressionCandidateClarificationQuestion(");
    expect(openCandidate).not.toContain("optionalClarificationQuestion(");
  });

  it("shows a standalone AI loading message before rendering the expression card", () => {
    const loadingMessage = componentSource.indexOf('v-if="organizationPending" class="message-row assistant organization-loading"');
    const expressionCard = componentSource.indexOf('v-else class="card-message-row"');

    expect(loadingMessage).toBeGreaterThan(-1);
    expect(expressionCard).toBeGreaterThan(loadingMessage);
    expect(componentSource).toContain("AI 正在整理表达卡");
    expect(componentSource).toContain("整理完成后，表达卡会出现在这里。");
    expect(componentSource).toContain('role="status" aria-live="polite"');
    expect(componentSource).toContain('v-if="question && !organizationPending"');
    expect(componentSource).not.toContain('class="organization-status loading"');
  });
});
