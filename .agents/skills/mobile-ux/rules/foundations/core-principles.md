# Core Principles

プラットフォームに依存しない、人間要因に基づく普遍原則。他領域のルールの根拠になる層であり、ここには具体的な寸法・数値の規定を置かない（数値は `rules/layout/` 等が正本）。
設計プロセス上の判断（何から作るか、どこまで作るか）はこの層で決まる。

## 設計の順序

```yaml
id: FOUND-001
title: Design from user goals, not from visual layout
area: foundations
subcategory: process
severity: critical
stability: core
platforms: [ios, android]
rule: >-
  Before producing any screen layout, component choice, or code, you MUST
  identify the target user, their goal, and the primary tasks, and derive the
  information architecture and user flow from them. Screens MUST be the output
  of that derivation, not its starting point.
rationale: >-
  Starting from visuals produces interfaces that mirror the data model or the
  generator's default template instead of the user's task, which yields extra
  screens, extra steps, and missing paths that no amount of visual polish fixes.
applies_to:
  - new app
  - new feature spanning multiple screens
  - redesign of an existing flow
exceptions:
  - T3 small changes (single label, color, or component fix) where the goal and
    flow are already established and unchanged.
good_examples:
  - "Requirement 'track books I read' → goal 'find whether I already read a book and record new ones' → tasks 'add book', 'search my list' → IA 'list + detail + add' → screens."
bad_examples:
  - "Requirement 'track books I read' → immediately generating a home screen with a hero card carousel and a bottom navigation of five tabs."
review_check: >-
  Does the design document state the user's goal and primary tasks before any
  screen is described, and can each screen be traced back to a listed task?
related: [FOUND-005, STATE-001]
sources:
  - title: NN/g — 10 Usability Heuristics (#8 Aesthetic and minimalist design)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: GOV.UK Design System — Question pages
    url: https://design-system.service.gov.uk/patterns/question-pages/
    tier: B
    note: One thing per page — structure follows the question the user must answer.
last_verified: 2026-08-08
```

## フィードバックと状態の可視化

```yaml
id: FOUND-002
title: Keep the user informed of system status
area: foundations
subcategory: feedback
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Every user action and every background state change that affects what the user
  can do MUST produce perceivable feedback within a reasonable time, delivered in
  proportion to its significance.
rationale: >-
  Without feedback users repeat actions, assume failure, or abandon the task,
  because they cannot tell whether the system received their input.
applies_to:
  - tap on an action control
  - submit / save / delete
  - background sync
  - connectivity changes
exceptions:
  - Instantaneous, obviously-visible changes where the result itself is the
    feedback (e.g. a toggle that flips).
good_examples:
  - "A Save button that switches to an in-progress state and then reports the result."
bad_examples:
  - "Tapping Submit with no visual change while a network call runs for three seconds."
review_check: >-
  For each action in this flow, is there a defined perceivable response for the
  in-progress, success, and failure cases?
related: [STATE-002, STATE-007, BTN-005]
sources:
  - title: NN/g — 10 Usability Heuristics (#1 Visibility of system status)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: Apple HIG — Feedback
    url: https://developer.apple.com/design/human-interface-guidelines/feedback
    tier: A
    note: Match feedback delivery to significance; passive for status, interruption only for critical information.
last_verified: 2026-08-08
```

## エラー予防

```yaml
id: FOUND-003
title: Prevent errors rather than only reporting them
area: foundations
subcategory: error-prevention
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Designs SHOULD remove error-prone conditions before they occur — constrain
  input to valid values, provide sensible defaults, and make risky actions
  reversible — rather than relying on error messages after the fact.
rationale: >-
  A prevented error costs the user nothing; a reported error costs attention,
  comprehension, and rework, and some users abandon the task instead of recovering.
applies_to:
  - forms
  - destructive actions
  - irreversible submissions
  - configuration screens
exceptions:
  - Cases where constraining input would exclude legitimate values (prefer wide
    acceptance plus normalization over rejection).
good_examples:
  - "Offering a date picker instead of free text for a date field."
  - "Providing Undo after deletion instead of a confirmation dialog for a recoverable action."
bad_examples:
  - "Accepting any text in a numeric field and rejecting it on submit."
review_check: >-
  For each error message in this design, was the option of preventing the error
  (constrained input, default value, or undo) considered and documented?
related: [FORM-004, DESTR-001]
sources:
  - title: NN/g — 10 Usability Heuristics (#5 Error prevention)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: WCAG 2.2 — 3.3.4 Error Prevention (Legal, Financial, Data)
    url: https://www.w3.org/TR/WCAG22/
    tier: A
    note: Level AA — reversible, checked, or confirmed.
last_verified: 2026-08-08
```

## ユーザーの制御と自由

```yaml
id: FOUND-004
title: Give users a way out of every state
area: foundations
subcategory: user-control
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Users MUST be able to leave, cancel, or undo any flow they entered, and the
  system MUST NOT force completion of a multi-step task that the user started
  by mistake.
rationale: >-
  Users frequently enter flows by accident; without a marked exit they resort to
  force-quitting the app, losing context and trust.
applies_to:
  - multi-step forms
  - onboarding
  - purchase and submission flows
  - destructive actions
exceptions:
  - Steps that are legally or transactionally final after confirmation (the exit
    exists before the final confirmation instead).
good_examples:
  - "A checkout flow where every step has Back and the cart is preserved on exit."
bad_examples:
  - "An onboarding sequence with no skip and no back, ending only on completion."
review_check: >-
  Can the user abandon each multi-step flow in this design at any step without
  losing previously entered data or being forced to complete it?
related: [NAV-001, ONBD-001, DESTR-001]
sources:
  - title: NN/g — 10 Usability Heuristics (#3 User control and freedom)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: Apple HIG — Modality
    url: https://developer.apple.com/design/human-interface-guidelines/modality
    tier: A
last_verified: 2026-08-08
```

## 認知負荷

```yaml
id: FOUND-005
title: Show only what the task needs
area: foundations
subcategory: cognitive-load
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Each screen SHOULD present the information and controls required for its task
  and defer the rest; secondary and rarely used options SHOULD be progressively
  disclosed rather than shown at the same level as the primary task.
rationale: >-
  Every additional element competes for attention with the relevant ones, and
  small screens amplify the cost of irrelevant content.
applies_to:
  - screen composition
  - settings
  - detail screens
  - dashboards
exceptions:
  - Safety-critical or legally required information that must remain visible.
good_examples:
  - "A detail screen showing the three fields users act on, with the rest behind a 'More details' disclosure."
bad_examples:
  - "A home screen showing every entity in the data model as an equally weighted card."
review_check: >-
  For each screen, is every element traceable to the screen's primary task or to
  a documented secondary need, with the rest deferred?
related: [FOUND-001, FOUND-006, LIST-002]
sources:
  - title: NN/g — 10 Usability Heuristics (#8 Aesthetic and minimalist design)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

## 再認と一貫性

```yaml
id: FOUND-006
title: Favor recognition over recall, and stay internally consistent
area: foundations
subcategory: consistency
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Information the user needs to act SHOULD be visible or easily retrievable
  rather than memorized, and the same concept SHOULD use the same word, icon,
  and placement everywhere in the app.
rationale: >-
  Memory load and inconsistent naming both force users to re-learn the interface
  on every screen, which slows every task and causes wrong choices.
applies_to:
  - labels and terminology
  - icons
  - repeated controls
  - multi-step flows carrying context
exceptions:
  - Deliberate platform differences where each platform's own convention wins
    (see rules/platform/).
good_examples:
  - "A multi-step form that restates the previously entered address on the confirmation step."
  - "Using the same verb 'Save' for the same action on every screen."
bad_examples:
  - "Calling the same object '記録' on one screen and 'エントリ' on another."
review_check: >-
  Does every repeated concept in this design use one consistent label, icon, and
  position, and does each step display the context the user needs instead of
  requiring them to remember it?
related: [WRITE-004, A11Y-007]
sources:
  - title: NN/g — 10 Usability Heuristics (#4 Consistency and standards, #6 Recognition rather than recall)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: WCAG 2.2 — 3.2.4 Consistent Identification
    url: https://www.w3.org/TR/WCAG22/
    tier: A
    note: Level AA.
last_verified: 2026-08-08
```
