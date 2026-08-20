import { describe, expect, it } from "vitest";
import componentSource from "../src/components/ExpressionClarification.vue?raw";
import shareModalSource from "../src/components/ShareCardModal.vue?raw";
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

  it("keeps cancellation, save behavior, and accessibility explicit", () => {
    const source = componentSource;

    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-label="取消并关闭编辑卡片"');
    expect(source).toContain(">取消</button>");
    expect(source).toContain("保存修改");
    expect(source).toContain("保存后会回到原对话，确认前不会分享");
    expect(source).toContain("commitBufferedEdits();");
    expect(source).toMatch(/function collapseDirectEdit\(\) \{\s*directEditing\.value = false;\s*\}/);
    expect(source).toMatch(/function saveDirectEdit\(\) \{[\s\S]*commitBufferedEdits\(\);[\s\S]*emit\("direct-edit-saved"\);/);
    expect(source).toMatch(/function updateBufferedField[\s\S]*editBuffer\.value = \{ \.\.\.editBuffer\.value, \[key\]: value \};\s*\}/);
    expect(source).toMatch(/function enterDirectEdit\(\) \{[\s\S]*initializeEditBuffer\(\);[\s\S]*directEditing\.value = true;/);
    expect(source).not.toContain("editBufferReady");
    expect(source).toMatch(/\.editor-close \{[^}]*min-width: 48px;[^}]*min-height: 48px;/s);
    expect(source).toContain("env(safe-area-inset-top)");
    expect(source).toContain("env(safe-area-inset-bottom)");
  });

  it("keeps the share card out of the expression card and opens a separate modal", () => {
    const invitationInline = componentSource.indexOf('class="invitation-inline"');
    const expressionCard = componentSource.indexOf('class="expression-card"');
    const shareModal = componentSource.indexOf("<ShareCardModal");

    expect(expressionCard).toBeGreaterThan(-1);
    expect(invitationInline).toBe(-1);
    expect(shareModal).toBeGreaterThan(expressionCard);
    expect(componentSource).toContain("确认表达内容");
    expect(componentSource).toContain("确认后才会生成独立分享卡");
    expect(componentSource).not.toContain("这次想谈什么");
    expect(componentSource).not.toContain("确认并分享这张表达卡");
  });

  it("shows generation, preview, sharing, and recoverable error in one share modal", () => {
    expect(shareModalSource).toContain("正在生成分享卡");
    expect(shareModalSource).toContain("确认分享给对方吗？");
    expect(shareModalSource).toContain("确认并分享");
    expect(shareModalSource).toContain("正在分享…");
    expect(shareModalSource).toContain("分享没有完成");
    expect(shareModalSource).toContain("重新分享");
    expect(shareModalSource).toContain('v-if="modelValue" class="share-layer"');
    expect(shareModalSource).toContain('role="dialog"');
    expect(shareModalSource).toContain('aria-modal="true"');
    expect(shareModalSource).toContain("原话、AI 对话和完整表达卡不会分享");
    expect(shareModalSource).not.toContain("这次想谈什么");
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
