import { describe, expect, it } from "vitest";
import discoverySource from "../src/components/ExpressionDiscovery.vue?raw";
import chooserSource from "../src/components/ExpressionModeChooser.vue?raw";

describe("ExpressionDiscovery inline path selection", () => {
  it("keeps path selection inside the AI conversation and preserves the composer", () => {
    expect(discoverySource).toContain('class="message-row assistant selection-message"');
    expect(discoverySource).toContain('class="message-bubble assistant-bubble path-picker-bubble"');
    expect(discoverySource).toContain('v-if="!readOnly" class="composer-dock"');
    expect(discoverySource).not.toContain('v-if="!readOnly && !selectionVisible" class="composer-dock"');
    expect(discoverySource).toContain("也可以告诉 AI 你还想补充什么");
  });

  it("uses a local selected state and only starts organization after confirmation", () => {
    expect(discoverySource).toContain(':model-value="pendingMode"');
    expect(discoverySource).toContain('@update:model-value="pendingMode = $event"');
    expect(discoverySource).toContain('@confirm="confirmPendingMode"');
    expect(discoverySource).toContain(':disabled="busy || readOnly"');
    expect(discoverySource).toContain('props.selectedMode ?? "NVC"');
    expect(discoverySource).toMatch(/function confirmPendingMode\(\)[\s\S]*emit\("selectMode", pendingMode\.value\);/);
  });

  it("renders compact accessible rows, privacy context, and an explicit outcome button", () => {
    expect(chooserSource).toContain('role="radiogroup"');
    expect(chooserSource).toContain(':aria-checked="modelValue === option.mode"');
    expect(chooserSource).toContain("原话和私人对话不会发给对方");
    expect(chooserSource).toContain("开始整理");
    expect(chooserSource).toContain("选择后仍可更换");
    expect(chooserSource).toContain("暂停或结束这次沟通");
    expect(chooserSource).not.toContain('? "✓" : "→"');
    expect(chooserSource).toMatch(/\.inline-confirm \{[^}]*min-height: 52px;/s);
    expect(chooserSource).toMatch(/\.mode-check \{[^}]*width: 48px;[^}]*height: 48px;/s);
  });
});
