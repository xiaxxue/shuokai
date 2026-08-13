# Rule Index

自動生成ファイル。編集禁止（`python3 scripts/validate_rules.py --index` で再生成）。
レビュー時はここから対象ルールを選定し、該当ファイルの `review_check` を実行する。

総ルール数: 131

| ID | Severity | Platforms | Title | File |
|----|----------|-----------|-------|------|
| DESTR-002 | critical | ios+android | Irreversible actions require confirmation that names the loss | patterns/destructive-actions.md |
| DESTR-003 | high | ios+android | Separate destructive controls from frequent ones | patterns/destructive-actions.md |
| DESTR-001 | medium | ios+android | Prefer undo over confirmation for recoverable actions | patterns/destructive-actions.md |
| NOTIF-001 | high | ios+android | Never make a notification the only path to a flow | patterns/notifications.md |
| NOTIF-002 | high | ios+android | Ask for notification permission from an intent-revealing action | patterns/notifications.md |
| NOTIF-007 | high | ios+android | Keep sensitive content off always-visible surfaces | patterns/notifications.md |
| NOTIF-003 | medium | android | Decide Android notification channels before the first release | patterns/notifications.md |
| NOTIF-004 | medium | ios+android | Reserve high-interruption delivery for time-critical events | patterns/notifications.md |
| NOTIF-005 | medium | ios+android | Do not repeat notifications for the same thing | patterns/notifications.md |
| NOTIF-006 | medium | ios+android | Every notification lands somewhere useful and states its own content | patterns/notifications.md |
| NOTIF-008 | low | ios+android | Provide notification preferences inside the app | patterns/notifications.md |
| ONBD-001 | medium | ios+android | Onboarding is skippable and never repeated | patterns/onboarding.md |
| ONBD-002 | medium | ios+android | Deliver value before asking for setup | patterns/onboarding.md |
| PERM-001 | high | ios+android | Explain why before requesting a permission | patterns/permissions.md |
| PERM-002 | high | ios+android | Never request multiple permissions at launch | patterns/permissions.md |
| PERM-003 | high | ios+android | Keep the feature usable after denial | patterns/permissions.md |
| WIDGET-001 | medium | ios+android | A widget shows information, not just a launcher | patterns/widgets.md |
| WIDGET-002 | medium | ios+android | Design the widget's placeholder, stale, and empty states | patterns/widgets.md |
| WIDGET-003 | medium | ios+android | Widget taps open the matching content | patterns/widgets.md |
| WIDGET-004 | medium | ios | End live activities when the activity ends | patterns/widgets.md |
| A11Y-001 | critical | ios+android | Every interactive element has an accessible name | rules/accessibility/accessibility.md |
| A11Y-002 | high | ios+android | Gestures and motion always have a simple alternative | rules/accessibility/accessibility.md |
| A11Y-003 | high | ios+android | Focus and reading order match the visual order | rules/accessibility/accessibility.md |
| A11Y-004 | high | ios+android | Layouts survive enlarged text and increased text spacing | rules/accessibility/accessibility.md |
| A11Y-006 | high | ios+android | Communicate state through more than one channel | rules/accessibility/accessibility.md |
| A11Y-005 | medium | ios+android | Prefer the simplest interaction for frequent actions | rules/accessibility/accessibility.md |
| A11Y-007 | medium | ios+android | Announce dynamic changes to assistive technology | rules/accessibility/accessibility.md |
| A11Y-008 | medium | ios+android | Respect reduced motion and avoid time-limited UI | rules/accessibility/accessibility.md |
| BTN-001 | high | ios+android | One clear primary action per screen | rules/components/buttons.md |
| BTN-002 | high | ios+android | The primary action must be visible without scrolling | rules/components/buttons.md |
| BTN-003 | high | ios+android | Destructive actions are styled and positioned as destructive | rules/components/buttons.md |
| BTN-004 | medium | ios+android | Do not use disabled buttons as the only error signal | rules/components/buttons.md |
| BTN-005 | medium | ios+android | Show progress inside the control for non-instant actions | rules/components/buttons.md |
| DLG-001 | high | ios+android | Dialog actions state their outcome and sit in the expected position | rules/components/dialogs-and-sheets.md |
| DLG-004 | high | ios+android | Never show more than one dialog at a time | rules/components/dialogs-and-sheets.md |
| DLG-005 | high | ios+android | Every dialog and sheet has an explicit dismissal | rules/components/dialogs-and-sheets.md |
| DLG-002 | medium | ios+android | Use a dialog only for critical, blocking decisions | rules/components/dialogs-and-sheets.md |
| DLG-003 | medium | ios+android | Limit dialogs to two actions and keep them self-contained | rules/components/dialogs-and-sheets.md |
| FORM-001 | high | ios+android | Every input has a persistent visible label | rules/components/forms.md |
| FORM-005 | high | ios+android | Validate at the right moment and identify the field in error | rules/components/forms.md |
| FORM-006 | high | ios+android | Never discard what the user entered | rules/components/forms.md |
| FORM-007 | high | ios+android | Errors are conveyed in text, not only visually | rules/components/forms.md |
| FORM-009 | high | ios+android | Confirm or make reversible any consequential submission | rules/components/forms.md |
| FORM-002 | medium | ios+android | State required and optional status before submission | rules/components/forms.md |
| FORM-003 | medium | ios+android | Ask for the fewest fields the task requires | rules/components/forms.md |
| FORM-004 | medium | ios+android | Match the input control and keyboard to the data | rules/components/forms.md |
| FORM-008 | medium | ios+android | Support autofill and avoid asking twice for the same data | rules/components/forms.md |
| LIST-003 | high | ios+android | Row actions must be reachable without gestures | rules/components/lists-and-cards.md |
| LIST-001 | medium | ios+android | Do not wrap every item in a card | rules/components/lists-and-cards.md |
| LIST-002 | low | ios+android | Keep list rows scannable | rules/components/lists-and-cards.md |
| JA-003 | high | ios+android | 全角・半角の違いをエラーで弾かない | rules/content/japanese-ux-writing.md |
| JA-001 | medium | ios+android | 必須・任意は全角「※」付きラベルで示す | rules/content/japanese-ux-writing.md |
| JA-002 | medium | ios+android | エラーテキストは全角「＊」で始め、誤りと直し方を書く | rules/content/japanese-ux-writing.md |
| JA-004 | medium | ios+android | サポートテキストで入力条件を示し、プレースホルダーで代用しない | rules/content/japanese-ux-writing.md |
| JA-006 | medium | ios+android | ボタンラベルは短い動詞句にし、体言止めの曖昧さを避ける | rules/content/japanese-ux-writing.md |
| JA-005 | low | ios+android | 敬体を統一し、過剰な敬語を避ける | rules/content/japanese-ux-writing.md |
| WRITE-001 | high | ios+android | Action labels name their outcome | rules/content/ux-writing.md |
| WRITE-002 | high | ios+android | Error messages state the cause and the fix | rules/content/ux-writing.md |
| WRITE-007 | high | ios+android | Confirmation copy names the consequence and its scope | rules/content/ux-writing.md |
| WRITE-003 | medium | ios+android | Do not blame, apologize, or joke in error copy | rules/content/ux-writing.md |
| WRITE-004 | medium | ios+android | Use the user's vocabulary, not the system's | rules/content/ux-writing.md |
| WRITE-006 | medium | ios+android | Empty and zero-result copy points to the next action | rules/content/ux-writing.md |
| WRITE-005 | low | ios+android | Keep UI copy short and concrete | rules/content/ux-writing.md |
| WRITE-008 | low | ios+android | Avoid ambiguous references and directional language | rules/content/ux-writing.md |
| FOUND-001 | critical | ios+android | Design from user goals, not from visual layout | rules/foundations/core-principles.md |
| FOUND-002 | high | ios+android | Keep the user informed of system status | rules/foundations/core-principles.md |
| FOUND-003 | high | ios+android | Prevent errors rather than only reporting them | rules/foundations/core-principles.md |
| FOUND-004 | high | ios+android | Give users a way out of every state | rules/foundations/core-principles.md |
| FOUND-005 | medium | ios+android | Show only what the task needs | rules/foundations/core-principles.md |
| FOUND-006 | medium | ios+android | Favor recognition over recall, and stay internally consistent | rules/foundations/core-principles.md |
| GEST-001 | high | ios+android | Do not redefine standard gestures | rules/interaction/gestures.md |
| GEST-002 | high | ios+android | Keep custom gestures clear of the system gesture areas | rules/interaction/gestures.md |
| GEST-003 | high | ios+android | Edge swipes supplement visible controls, never replace them | rules/interaction/gestures.md |
| GEST-004 | medium | ios+android | Custom gestures must be discoverable and simple | rules/interaction/gestures.md |
| HAPT-001 | medium | ios+android | Haptics must not carry information on their own | rules/interaction/haptics.md |
| HAPT-002 | medium | ios+android | Use the platform's semantic haptic constants | rules/interaction/haptics.md |
| HAPT-003 | medium | ios+android | Use haptics sparingly and never override the user's setting | rules/interaction/haptics.md |
| HAPT-004 | low | android | Omit haptics that the device cannot render cleanly | rules/interaction/haptics.md |
| ADAPT-003 | critical | ios+android | Preserve user work across configuration changes | rules/layout/adaptive.md |
| ADAPT-001 | high | ios+android | Branch layout on window size, never on device type | rules/layout/adaptive.md |
| ADAPT-002 | high | ios+android | Do not rely on orientation locking on large screens | rules/layout/adaptive.md |
| ADAPT-004 | medium | ios+android | Hoist state that is hidden at some window sizes | rules/layout/adaptive.md |
| ADAPT-005 | medium | ios+android | Choose a canonical multi-pane layout instead of stretching | rules/layout/adaptive.md |
| ADAPT-006 | medium | ios+android | Do not stretch secondary UI to the full window width | rules/layout/adaptive.md |
| ADAPT-007 | medium | android | Keep content and controls clear of the fold | rules/layout/adaptive.md |
| ADAPT-008 | medium | android | Adapt the navigation component to the window, not to the device | rules/layout/adaptive.md |
| COLOR-001 | critical | ios+android | Minimum text contrast ratio | rules/layout/color-and-contrast.md |
| COLOR-002 | high | ios+android | Non-text UI elements meet 3:1 contrast | rules/layout/color-and-contrast.md |
| COLOR-003 | high | ios+android | Never convey information by color alone | rules/layout/color-and-contrast.md |
| COLOR-004 | medium | ios+android | Support both light and dark appearance | rules/layout/color-and-contrast.md |
| COLOR-005 | medium | ios+android | Use semantic system colors instead of hard-coded values | rules/layout/color-and-contrast.md |
| REACH-001 | low | ios+android | Keep primary actions out of the top of the screen | rules/layout/reachability.md |
| REACH-002 | suggestion | ios+android | Do not assume a single grip or hand | rules/layout/reachability.md |
| SPACE-001 | high | ios+android | Respect safe areas and system insets | rules/layout/spacing-and-safe-area.md |
| SPACE-002 | high | ios+android | Keep the focused input visible above the keyboard | rules/layout/spacing-and-safe-area.md |
| SPACE-003 | medium | ios+android | Avoid two-dimensional scrolling and nested scroll areas | rules/layout/spacing-and-safe-area.md |
| SPACE-004 | low | ios+android | Use one consistent spacing scale | rules/layout/spacing-and-safe-area.md |
| TOUCH-001 | high | ios+android | Minimum touch target size | rules/layout/touch-targets.md |
| TOUCH-002 | medium | ios+android | Separate adjacent targets, especially opposing actions | rules/layout/touch-targets.md |
| TOUCH-003 | suggestion | ios+android | Enlarge targets for primary and on-the-go actions | rules/layout/touch-targets.md |
| TYPE-001 | high | ios+android | Respect the user's system text size setting | rules/layout/typography.md |
| TYPE-002 | medium | ios+android | Body text meets the platform minimum size | rules/layout/typography.md |
| TYPE-004 | medium | ios+android | Keep hierarchy and truncation sane at large text sizes | rules/layout/typography.md |
| TYPE-003 | low | ios+android | Avoid thin weights and excessive typeface variety | rules/layout/typography.md |
| TYPE-005 | low | ios+android | Keep line length and line spacing readable | rules/layout/typography.md |
| NAV-001 | critical | ios+android | Every screen provides a perceivable back or close affordance | rules/navigation/navigation.md |
| NAV-005 | high | ios+android | Use modal presentation only for focused, self-contained tasks | rules/navigation/navigation.md |
| NAV-007 | high | ios+android | Tab bar items stay visible, enabled, and in fixed order | rules/navigation/navigation.md |
| NAV-008 | high | ios+android | Never block or repurpose the platform's standard back affordances | rules/navigation/navigation.md |
| NAV-010 | high | ios+android | Confirm before dismissal that would discard unsaved input | rules/navigation/navigation.md |
| NAV-002 | medium | android | Android navigation bar holds three to five destinations | rules/navigation/navigation.md |
| NAV-003 | medium | ios | iOS tab bar uses the fewest tabs needed and avoids overflow | rules/navigation/navigation.md |
| NAV-004 | medium | ios+android | Tab bar items are navigation destinations, never actions | rules/navigation/navigation.md |
| NAV-006 | medium | ios+android | Keep modal flows single-path and hierarchies shallow | rules/navigation/navigation.md |
| NAV-009 | medium | ios+android | Navigation order and identification are consistent across screens | rules/navigation/navigation.md |
| AND-001 | high | android | Support the predictive back gesture | rules/platform/android.md |
| AND-002 | high | android | Handle window insets under enforced edge-to-edge | rules/platform/android.md |
| AND-004 | high | android | System back must never be destructive | rules/platform/android.md |
| AND-003 | medium | android | Use Material components and Android navigation structures | rules/platform/android.md |
| IOS-002 | high | ios | Preserve the interactive back-swipe and system gestures | rules/platform/ios.md |
| IOS-001 | medium | ios | Use standard iOS components and navigation patterns | rules/platform/ios.md |
| IOS-003 | low | ios | Follow current material and color conventions for bars | rules/platform/ios.md |
| STATE-001 | critical | ios+android | Decide every UI state explicitly for every screen | rules/states/ui-states.md |
| STATE-005 | critical | ios+android | Error states provide a recovery path | rules/states/ui-states.md |
| STATE-004 | high | ios+android | Empty states explain the situation and offer the next action | rules/states/ui-states.md |
| STATE-006 | high | ios+android | Design for offline and degraded connectivity | rules/states/ui-states.md |
| STATE-009 | high | ios+android | Permission-denied is a designed state, not an error | rules/states/ui-states.md |
| STATE-002 | medium | ios+android | Loading states show what is loading, not a bare spinner | rules/states/ui-states.md |
| STATE-003 | medium | ios+android | Show usable content as early as possible | rules/states/ui-states.md |
| STATE-007 | medium | ios+android | Confirm completion proportionally, without blocking | rules/states/ui-states.md |
| STATE-008 | medium | ios+android | Disabled states explain themselves or are avoided | rules/states/ui-states.md |
