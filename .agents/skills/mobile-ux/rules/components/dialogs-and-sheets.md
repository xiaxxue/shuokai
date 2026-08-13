# Dialogs and Sheets

ダイアログ・アラート・ボトムシートの使用条件と構成。モーダル遷移そのものの是非は `rules/navigation/navigation.md`（NAV-005, NAV-006）が扱う。

プラットフォーム差: Material 3 のダイアログは最大2アクション、iOS のアラートは最大3ボタン。両OS対応時は厳しい方（2アクション）に寄せるのが安全。

```yaml
id: DLG-001
title: Dialog actions state their outcome and sit in the expected position
area: components
subcategory: actions
severity: high
stability: convention
platforms: [ios, android]
rule: >-
  Dialog buttons MUST use labels that name the resulting action rather than
  generic agreement, and the confirming action MUST sit at the trailing edge with
  the dismissive action to its leading side.
rationale: >-
  Users tap dialog buttons by position and habit; a generic label plus a
  non-standard position produces confident taps on the wrong choice.
values:
  ios: one- or two-word verb titles describing the result; avoid "OK" except in purely informational alerts; always title the cancel button "Cancel"; default button trailing, Cancel leading
  android: the confirming button is closest to the trailing edge, dismissive actions to its left (auto-flipped in RTL); when stacked, confirming is on top
applies_to:
  - alerts and confirmation dialogs
  - action sheets
  - destructive confirmations
exceptions:
  - Purely informational alerts with a single acknowledgement button.
good_examples:
  - "'キャンセル' / '削除' with 削除 at the trailing edge."
bad_examples:
  - "'OK' / 'いいえ' where OK deletes the record."
review_check: >-
  Does every dialog button name its outcome (not "OK"/"Yes"), with the confirming
  action at the trailing edge and the dismissive action to its leading side?
related: [DLG-003, BTN-003, WRITE-001]
sources:
  - title: Apple HIG — Alerts
    url: https://developer.apple.com/design/human-interface-guidelines/alerts
    tier: A
  - title: Material Design 3 — Dialogs guidelines
    url: https://m3.material.io/components/dialogs/guidelines
    tier: A
last_verified: 2026-08-08
```

```yaml
id: DLG-002
title: Use a dialog only for critical, blocking decisions
area: components
subcategory: usage
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  A dialog MUST be reserved for information or decisions that justify blocking
  the app; low- and medium-priority feedback MUST use an inline message or a
  transient notice instead.
rationale: >-
  Every dialog stops the task and demands a decision; when routine feedback is
  delivered this way, users dismiss dialogs reflexively and stop reading the
  important ones.
values:
  android: dialogs disable all app functionality until confirmed or dismissed; use snackbars for low-priority information
  ios: use alerts sparingly and only for essential, actionable information; avoid alerts at app launch and purely informational alerts
applies_to:
  - confirmations
  - success and failure notices
  - onboarding tips and promotions
exceptions:
  - Irreversible destructive actions and consequential submissions (see DESTR-002, FORM-009).
good_examples:
  - "Showing '保存しました' as a transient message rather than an alert."
bad_examples:
  - "An alert on launch announcing a new feature."
  - "A confirmation dialog for marking a to-do item complete."
review_check: >-
  Does every dialog in this design block the user for a decision that is
  irreversible or critical, rather than for routine feedback?
related: [DLG-003, DLG-004, STATE-007, NAV-005]
sources:
  - title: Material Design 3 — Dialogs guidelines
    url: https://m3.material.io/components/dialogs/guidelines
    tier: A
  - title: Material Design 3 — Snackbar guidelines
    url: https://m3.material.io/components/snackbar/guidelines
    tier: A
  - title: Apple HIG — Alerts
    url: https://developer.apple.com/design/human-interface-guidelines/alerts
    tier: A
last_verified: 2026-08-08
```

```yaml
id: DLG-003
title: Limit dialogs to two actions and keep them self-contained
area: components
subcategory: structure
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  A dialog SHOULD offer at most two actions — one confirming and one dismissive —
  and MUST NOT offer an action that navigates the user away before the decision
  is resolved.
rationale: >-
  A third choice turns a decision into a comparison task, and a "learn more" exit
  abandons the task without resolving it, forcing users to start over.
values:
  android: maximum two actions; a third action such as "Learn more" is discouraged
  ios: alerts display up to three buttons; keep titles to at most two lines
applies_to:
  - alerts and confirmation dialogs
exceptions:
  - Platform-standard three-button alerts on iOS where a genuine third choice
    exists (e.g. Save / Discard / Cancel).
good_examples:
  - "'キャンセル' / '破棄' on a discard-changes dialog."
bad_examples:
  - "A dialog with 'あとで' / '詳しく見る' / '購入' where 詳しく見る leaves the flow."
review_check: >-
  Does each dialog offer at most two actions (three only for a genuine iOS
  save/discard/cancel case), with none of them navigating away from the decision?
related: [DLG-001, DLG-002]
sources:
  - title: Material Design 3 — Dialogs guidelines
    url: https://m3.material.io/components/dialogs/guidelines
    tier: A
  - title: Apple HIG — Alerts
    url: https://developer.apple.com/design/human-interface-guidelines/alerts
    tier: A
last_verified: 2026-08-08
```

```yaml
id: DLG-004
title: Never show more than one dialog at a time
area: components
subcategory: stacking
severity: high
stability: convention
platforms: [ios, android]
rule: >-
  Multiple alerts or dialogs MUST NOT be displayed simultaneously or queued to
  appear back-to-back on launch; one modal MUST be dismissed before another is
  presented.
rationale: >-
  Stacked dialogs hide each other's context, and a queue of them at launch trains
  users to dismiss everything without reading, including consequential prompts.
values:
  ios: never display more than one alert at the same time; let people dismiss one modal before presenting another
  android: only one snackbar may be displayed at a time
applies_to:
  - app launch sequences
  - permission requests
  - error handling in parallel operations
exceptions:
  - A system-level alert appearing over an app modal, which the app does not control.
good_examples:
  - "Deferring a rating prompt until after the update notice is dismissed and the user completes a task."
bad_examples:
  - "Launch showing a what's-new dialog, then a permission rationale dialog, then a rating prompt."
review_check: >-
  Does this flow guarantee that at most one dialog is presented at a time, with
  no launch-time queue of prompts?
related: [DLG-002, PERM-002, NAV-006]
sources:
  - title: Apple HIG — Modality
    url: https://developer.apple.com/design/human-interface-guidelines/modality
    tier: A
  - title: Material Design 3 — Snackbar guidelines
    url: https://m3.material.io/components/snackbar/guidelines
    tier: A
last_verified: 2026-08-08
```

```yaml
id: DLG-005
title: Every dialog and sheet has an explicit dismissal
area: components
subcategory: dismissal
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Dialogs and sheets MUST provide an explicit dismissal control, the dismissive
  action MUST NOT be disabled, and dismissal MUST NOT depend solely on a swipe or
  a tap outside the surface.
rationale: >-
  A modal whose only exit is an undiscoverable gesture or which disables its
  cancel path traps the user in a decision they may not be able to make.
values:
  android: dismissive actions are never disabled
  ios: always give an obvious way to dismiss a modal; confirm before closing if data loss is possible
applies_to:
  - alerts and dialogs
  - bottom sheets
  - full-screen modals
exceptions:
  - Blocking states the app genuinely cannot proceed past (e.g. forced update),
    which must still explain the situation and offer an action.
good_examples:
  - "A bottom sheet with a visible Close button in addition to swipe-down dismissal."
bad_examples:
  - "A sheet whose Cancel button is disabled until a selection is made."
review_check: >-
  Does every dialog and sheet expose a visible, always-enabled way to dismiss it
  beyond gestures and outside taps?
related: [NAV-001, FOUND-004, DLG-001]
sources:
  - title: Apple HIG — Modality
    url: https://developer.apple.com/design/human-interface-guidelines/modality
    tier: A
  - title: Material Design 3 — Dialogs guidelines
    url: https://m3.material.io/components/dialogs/guidelines
    tier: A
last_verified: 2026-08-08
```
