# Buttons

ボタンの強調度・配置・状態のルール。ボタンの文言規範は `rules/content/ux-writing.md`（WRITE-001）、寸法は `rules/layout/touch-targets.md`（TOUCH-001）が正本。

```yaml
id: BTN-001
title: One clear primary action per screen
area: components
subcategory: hierarchy
severity: high
stability: convention
platforms: [ios, android]
rule: >-
  Each screen or sheet SHOULD present exactly one visually prominent primary
  action, and MUST NOT present multiple equally emphasized actions that compete
  for the same decision.
rationale: >-
  When every action looks primary, users must read and compare all of them before
  acting, and the intended path stops being obvious.
values:
  ios: limit prominent buttons to one or two per view; distinguish the preferred choice by style, not size
  android: the filled style has the most visual impact after the FAB and should ideally be used only once per page
applies_to:
  - screen action areas
  - sheets and dialogs
  - forms
exceptions:
  - Screens offering a genuine either/or choice of equal weight (e.g. "Sign in" / "Create account"),
    where equal styling communicates that the options are parallel.
good_examples:
  - "A filled Save button with Cancel rendered as a text button."
bad_examples:
  - "Three filled accent-colored buttons stacked at the bottom of a form."
review_check: >-
  Does each screen have exactly one visually dominant action, with secondary
  actions rendered in a lower-emphasis style?
related: [BTN-002, BTN-003, TOUCH-003]
sources:
  - title: Apple HIG — Buttons
    url: https://developer.apple.com/design/human-interface-guidelines/buttons
    tier: A
  - title: Material Design 3 — Buttons guidelines
    url: https://m3.material.io/components/buttons/guidelines
    tier: A
last_verified: 2026-08-08
```

```yaml
id: BTN-002
title: The primary action must be visible without scrolling
area: components
subcategory: placement
severity: high
stability: core
platforms: [ios, android]
rule: >-
  The action that completes the screen's primary task MUST be discoverable
  without hunting — visible on first render or reachable through an obvious,
  persistent affordance — and MUST NOT be hidden behind an overflow menu.
rationale: >-
  A primary action placed below the fold or inside an overflow menu is not found
  by many users, who then conclude the app cannot do the thing it was built for.
applies_to:
  - form submission
  - create / add actions
  - checkout and confirmation screens
exceptions:
  - Long-form content screens where a persistent bottom bar would obscure the
    content, provided the action is pinned or repeated at a predictable location.
good_examples:
  - "An Add button in the toolbar plus a floating action button on a list screen."
bad_examples:
  - "The only 'Create' entry point living in a three-dot menu on the home screen."
review_check: >-
  On first render of each screen, is the primary action visible or reachable via
  a persistent control rather than hidden inside a menu?
related: [BTN-001, FOUND-001]
sources:
  - title: Apple HIG — Toolbars
    url: https://developer.apple.com/design/human-interface-guidelines/toolbars
    tier: A
    note: Give exactly one prominent primary action, placed on the trailing edge.
  - title: Material Design 3 — Buttons guidelines
    url: https://m3.material.io/components/buttons/guidelines
    tier: A
    note: Move low-priority actions to overflow menus — implying primary actions stay out of them.
last_verified: 2026-08-08
```

```yaml
id: BTN-003
title: Destructive actions are styled and positioned as destructive
area: components
subcategory: destructive
severity: high
stability: convention
platforms: [ios, android]
rule: >-
  A destructive action MUST be visually distinguished from the confirming action,
  MUST NOT be given the default or primary role, and MUST be accompanied by a
  cancel path.
rationale: >-
  When a destructive action carries the default styling or sits where users
  expect confirmation, muscle memory alone destroys data.
values:
  ios: apply the destructive style (system red) only to destructive actions; never assign the primary/default role to a destructive button; always include Cancel
applies_to:
  - delete, remove, discard, sign-out actions
  - alerts and action sheets
  - list row actions
exceptions:
  - Fully undoable deletions presented with an immediate Undo affordance may use
    ordinary styling without a confirmation step (see DESTR-001).
good_examples:
  - "A Delete alert whose Delete button is red and non-default, with Cancel present."
bad_examples:
  - "A filled accent-colored Delete button placed where Save normally sits."
review_check: >-
  Is every destructive action visually distinct from the confirming action,
  non-default, and paired with a cancel or undo path?
related: [DESTR-002, DESTR-003, DLG-001, TOUCH-002]
sources:
  - title: Apple HIG — Alerts
    url: https://developer.apple.com/design/human-interface-guidelines/alerts
    tier: A
  - title: Apple HIG — Buttons (roles)
    url: https://developer.apple.com/design/human-interface-guidelines/buttons
    tier: A
last_verified: 2026-08-08
```

```yaml
id: BTN-004
title: Do not use disabled buttons as the only error signal
area: components
subcategory: states
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  A disabled control MUST NOT be the only indication that something is missing
  or invalid; when an action is unavailable, the reason and the way to enable it
  MUST be communicated in text, or the control SHOULD stay enabled and explain
  the problem on activation.
rationale: >-
  Disabled controls have low contrast and poor assistive-technology support, and
  a greyed-out button tells the user nothing about what to fix, which is a common
  dead end in forms.
applies_to:
  - submit buttons in forms
  - actions with prerequisites
  - multi-step flows
exceptions:
  - Controls disabled for reasons already obvious from the visible state
    (e.g. a Next button on the last page of a pager).
good_examples:
  - "A Submit button that stays enabled and, when tapped with an incomplete form, moves focus to the first error."
bad_examples:
  - "A permanently greyed-out Continue button with no explanation of what is missing."
review_check: >-
  For each disabled control in this design, is the reason it is disabled stated
  in visible text, or does the control instead stay enabled and explain the problem?
related: [FORM-005, STATE-008, WRITE-002]
sources:
  - title: USWDS — Form component guidance
    url: https://designsystem.digital.gov/components/form/
    tier: B
    note: Strongly discourages disabled inputs due to contrast and screen reader issues.
  - title: Material Design 3 — Dialogs guidelines
    url: https://m3.material.io/components/dialogs/guidelines
    tier: A
    note: Dismissive actions are never disabled.
last_verified: 2026-08-08
```

```yaml
id: BTN-005
title: Show progress inside the control for non-instant actions
area: components
subcategory: feedback
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  When activating a control starts an operation that is not instantaneous, the
  control MUST enter a visible in-progress state and MUST prevent duplicate
  submissions until the operation resolves.
rationale: >-
  Without in-place feedback users tap again, producing duplicate orders, duplicate
  records, or duplicate messages.
applies_to:
  - submit, save, send, purchase actions
  - sign-in buttons
  - upload triggers
exceptions:
  - Optimistic actions that complete locally and reconcile in the background,
    provided failure is surfaced afterwards.
good_examples:
  - "A Checkout button showing an activity indicator and the label 'Processing…' while the request runs."
bad_examples:
  - "A Send button that looks unchanged for three seconds and creates two messages when tapped twice."
review_check: >-
  Does every action that triggers a network or long-running operation show an
  in-progress state on the control and block repeat activation?
related: [FOUND-002, STATE-002]
sources:
  - title: Apple HIG — Buttons
    url: https://developer.apple.com/design/human-interface-guidelines/buttons
    tier: A
    note: iOS/iPadOS — show an activity indicator inside a button for non-instant actions.
  - title: NN/g — 10 Usability Heuristics (#1 Visibility of system status)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```
