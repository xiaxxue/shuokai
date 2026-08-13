# Navigation

画面間移動の構造に関するルール。タブ / スタック / モーダルの使い分け、戻る操作の保証、階層の深さ、ナビゲーションの一貫性を扱う。
タブバーやツールバーの見た目・寸法は `rules/layout/` と `rules/platform/`、ダイアログ自体の構成は `rules/components/dialogs-and-sheets.md`（DLG-*）が正本。

## 戻る操作の保証

```yaml
id: NAV-001
title: Every screen provides a perceivable back or close affordance
area: navigation
subcategory: back-navigation
severity: critical
stability: core
platforms: [ios, android]
rule: >-
  Every screen, modal, and full-screen overlay MUST provide a clearly visible,
  user-recognizable way to go back or close it (back button, close button, or
  equivalent affordance). A gesture MUST NOT be the only way to leave a view.
rationale: >-
  A view without a recognizable exit traps users. People need a clearly marked
  way out of unwanted states, and gesture-only escape routes are not
  discoverable by everyone (novices, assistive-technology users).
applies_to:
  - screen
  - modal sheet
  - full-screen dialog
  - overlay / media viewer
  - onboarding step
  - error and permission screens
exceptions:
  - The root screen of each top-level section (the tab bar itself is the exit).
  - Deliberately locked kiosk/exam-style flows, documented as a product decision.
good_examples:
  - "A full-screen photo viewer with a visible Close (X) toolbar button in addition to swipe-down dismissal."
bad_examples:
  - "A bottom sheet that can only be dismissed by swiping down, with no visible close control."
  - "A full-screen error view with no button that navigates anywhere."
review_check: >-
  Does every screen, sheet, and overlay in this flow (including loading, error,
  and permission-denied variants) show a visible control that goes back or
  closes the view, in addition to any dismissal gesture?
related: [NAV-008, DLG-005]
sources:
  - title: Apple HIG — Modality
    url: https://developer.apple.com/design/human-interface-guidelines/modality
    tier: A
    note: Always give an obvious way to dismiss a modal.
  - title: NN/g — 10 Usability Heuristics (#3 User control and freedom)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: GOV.UK Design System — Question pages (back link)
    url: https://design-system.service.gov.uk/patterns/question-pages/
    tier: B
last_verified: 2026-08-08
```

## タブ数と使い分け

```yaml
id: NAV-002
title: Android navigation bar holds three to five destinations
area: navigation
subcategory: tabs
severity: medium
stability: convention
platforms: [android]
rule: >-
  An Android bottom navigation bar SHOULD contain three to five top-level
  destinations. With fewer than three, use tabs instead; with more than five,
  use tabs or a modal expanded navigation rail.
rationale: >-
  Below three destinations a navigation bar wastes persistent screen space;
  above five, targets shrink and destinations become hard to distinguish,
  increasing mis-taps and search time.
values:
  android: "3-5 destinations (M3 navigation bar); <3 = use tabs, >5 = tabs or modal expanded navigation rail"
  android_rail: "collapsed navigation rail = 3-7 items (medium/expanded windows)"
applies_to: [navigation bar, bottom navigation]
exceptions:
  - Compact/medium window sizes only; expanded and larger windows use a navigation rail instead.
good_examples:
  - "An app with Home, Search, Library, Profile in a bottom navigation bar."
bad_examples:
  - "A bottom navigation bar with 2 destinations, or with 6 crowded destinations."
review_check: >-
  Does the Android bottom navigation bar contain between three and five
  destinations, with alternatives (tabs / rail) used outside that range?
related: [NAV-003, NAV-004, NAV-007]
sources:
  - title: Material Design 3 — Navigation bar guidelines
    url: https://m3.material.io/components/navigation-bar/guidelines
    tier: A
  - title: Material Design 3 — Navigation rail guidelines
    url: https://m3.material.io/components/navigation-rail/guidelines
    tier: A
last_verified: 2026-08-08
```

```yaml
id: NAV-003
title: iOS tab bar uses the fewest tabs needed and avoids overflow
area: navigation
subcategory: tabs
severity: medium
stability: convention
platforms: [ios]
rule: >-
  An iOS tab bar SHOULD contain the fewest tabs needed for the app's
  information hierarchy, and SHOULD avoid so many tabs that the system creates
  an overflow "More" tab. For complex hierarchies prefer a sidebar-adaptable
  tab bar (iPadOS) instead of adding tabs.
rationale: >-
  It is easier to navigate among fewer tabs, and an overflow tab hides
  destinations behind an extra step. Note that the current HIG does not
  prescribe a fixed "3-5" count for iOS; do not cite one.
values:
  ipados: "aim for a default list of five or fewer customizable tabs"
  ios: "no fixed numeric maximum in the current HIG; 'the fewest tabs needed' + avoid overflow"
applies_to: [tab bar]
good_examples:
  - "Four tabs covering the app's top-level sections, each reachable in one tap."
bad_examples:
  - "Seven tabs forcing the system to collapse the last ones into a More tab."
review_check: >-
  Is every tab a distinct top-level section, is the tab count the minimum
  needed, and does no overflow ("More") tab appear on any supported device?
related: [NAV-002, NAV-004, NAV-007]
sources:
  - title: Apple HIG — Tab bars
    url: https://developer.apple.com/design/human-interface-guidelines/tab-bars
    tier: A
    note: "Use the fewest tabs needed; avoid situations that create a More tab. iPadOS: default list of five or fewer."
last_verified: 2026-08-08
```

```yaml
id: NAV-004
title: Tab bar items are navigation destinations, never actions
area: navigation
subcategory: tabs
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  Tab / navigation bar items SHOULD only navigate between top-level sections of
  the app. An item SHOULD NOT trigger an action on the current view (compose,
  scan, open camera); place actions in toolbars, FABs, or buttons instead.
rationale: >-
  Users rely on the tab bar as a stable map of the app. Mixing actions into it
  breaks the mental model, causes accidental mode changes, and makes the
  "current location" ambiguous.
applies_to: [tab bar, navigation bar]
good_examples:
  - "A 'New post' action offered as a FAB above the Android navigation bar, not as a fake destination."
bad_examples:
  - "A center tab-bar item that opens the camera instead of switching sections."
review_check: >-
  Does every tab / navigation bar item switch to a section of the app (and
  none of them perform an action such as compose, scan, or share)?
related: [NAV-002, NAV-003]
sources:
  - title: Apple HIG — Tab bars
    url: https://developer.apple.com/design/human-interface-guidelines/tab-bars
    tier: A
    note: Use a tab bar for navigation only, never for actions (use a toolbar for actions).
  - title: Material Design 3 — Navigation bar guidelines
    url: https://m3.material.io/components/navigation-bar/guidelines
    tier: A
    note: Navigation bars provide access to destinations; destinations are fixed.
last_verified: 2026-08-08
```

## モーダルの使用条件と階層

```yaml
id: NAV-005
title: Use modal presentation only for focused, self-contained tasks
area: navigation
subcategory: modality
severity: high
stability: core
platforms: [ios, android]
rule: >-
  A view MUST NOT be presented modally unless there is a clear benefit:
  focusing attention on a critical decision, confirming or modifying a recent
  action, or completing a distinct, narrowly scoped task. Routine browsing and
  primary navigation MUST use non-modal navigation (push / tabs).
rationale: >-
  Modality blocks everything else in the app. Overusing it interrupts users,
  hides context, and multiplies the risk of trapped or stacked states.
applies_to: [modal sheet, full-screen modal, dialog, blocking overlay]
good_examples:
  - "Editing a single event's details in a sheet, with the calendar visible behind it."
bad_examples:
  - "Opening every detail screen of a list modally, so Back behaves inconsistently."
  - "A modal splash that blocks the app to promote a feature at launch."
review_check: >-
  For each modal in this flow, can you name which benefit applies (focus a
  critical decision / confirm-modify a recent action / short scoped task), and
  is all primary navigation non-modal?
related: [NAV-006, NAV-010, DLG-002]
sources:
  - title: Apple HIG — Modality
    url: https://developer.apple.com/design/human-interface-guidelines/modality
    tier: A
  - title: Material Design 3 — Dialogs guidelines
    url: https://m3.material.io/components/dialogs/guidelines
    tier: A
    note: A dialog disables all app functionality until confirmed or dismissed; use sparingly.
last_verified: 2026-08-08
```

```yaml
id: NAV-006
title: Keep modal flows single-path and hierarchies shallow
area: navigation
subcategory: hierarchy
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  A modal flow SHOULD be short and provide a single path through its subviews.
  Modal presentations SHOULD NOT nest into further modal hierarchies that feel
  like an app within the app, and drill-down depth SHOULD be kept to the
  minimum the content structure requires.
rationale: >-
  Deep or branching modal stacks make users lose track of where they are and
  how to get out, and multiply back/dismiss ambiguity.
applies_to: [modal flow, wizard, drill-down stack]
good_examples:
  - "A 3-step checkout sheet with a linear path and one Done exit."
bad_examples:
  - "A settings modal that opens another modal that opens a third, each with its own Close button."
review_check: >-
  Does each modal flow have one linear path and one exit, with no modal
  presented on top of another modal (alerts excepted)?
related: [NAV-005, DLG-004]
sources:
  - title: Apple HIG — Modality
    url: https://developer.apple.com/design/human-interface-guidelines/modality
    tier: A
    note: Avoid modal hierarchies that feel like an app within the app; provide a single path through subviews.
last_verified: 2026-08-08
```

## タブバーの安定性・一貫性

```yaml
id: NAV-007
title: Tab bar items stay visible, enabled, and in fixed order
area: navigation
subcategory: tabs
severity: high
stability: convention
platforms: [ios, android]
rule: >-
  Tab / navigation bar items MUST remain visible, enabled, and in a fixed order
  throughout in-app navigation. When a section's content is unavailable, keep
  the item enabled and explain the situation inside that section instead of
  hiding, disabling, or reordering items.
rationale: >-
  The tab bar is the user's stable map of the app. Items that vanish, gray
  out, or move destroy spatial memory and leave no way to learn why a section
  is unavailable.
values:
  ios: "keep the tab bar visible during in-app navigation (exception: covered by a modal view); never disable or hide individual tab items"
  android: "destinations have fixed positions; do not scroll, reorder, or remove labels"
applies_to: [tab bar, navigation bar]
exceptions:
  - A modal view may temporarily cover the tab bar (iOS).
good_examples:
  - "A 'Downloads' tab that stays enabled offline and shows an explanation with next steps inside."
bad_examples:
  - "Graying out the Store tab when the user is signed out."
review_check: >-
  Across all navigation paths and data conditions, do the tab items keep the
  same set, order, and enabled state, with unavailable content explained
  inside the section?
related: [NAV-002, NAV-003, STATE-004, STATE-008]
sources:
  - title: Apple HIG — Tab bars
    url: https://developer.apple.com/design/human-interface-guidelines/tab-bars
    tier: A
  - title: Material Design 3 — Navigation bar guidelines
    url: https://m3.material.io/components/navigation-bar/guidelines
    tier: A
last_verified: 2026-08-08
```

## システム標準の戻る動作

```yaml
id: NAV-008
title: Never block or repurpose the platform's standard back affordances
area: navigation
subcategory: back-navigation
severity: high
stability: convention
platforms: [ios, android]
rule: >-
  The app MUST NOT block, repurpose, or override the platform's standard back
  affordances (Android system back / predictive back; iOS Back button and
  edge-swipe). Custom shortcut gestures MAY supplement standard navigation but
  MUST NOT replace the visible affordance.
rationale: >-
  Users carry system-wide back expectations across apps. Intercepting or
  redefining back strands users, and on current Android the old interception
  APIs no longer work at all.
values:
  android: "targetSdk 36 (Android 16): predictive back animations are on by default; onBackPressed is not called and KEYCODE_BACK is not dispatched — interception is unsupported"
  ios: "the edge-swipe back gesture complements the Back button, which must remain visible"
applies_to: [system back gesture, back button, edge swipe, custom gesture handlers]
exceptions:
  - Asking for confirmation before leaving when unsaved data would be lost (see NAV-010), implemented via the supported APIs (e.g. OnBackPressedDispatcher).
good_examples:
  - "Migrating to OnBackPressedDispatcher / OnBackInvokedCallback so predictive back previews work."
bad_examples:
  - "Consuming the back gesture to show an interstitial ad or exit-intent dialog on every screen."
review_check: >-
  Do system back (Android) and the Back button / edge-swipe (iOS) always
  navigate one level up or close the current view, without being consumed for
  unrelated behavior?
related: [NAV-001, NAV-010]
sources:
  - title: Android Developers — Android 16 behavior changes (predictive back)
    url: https://developer.android.com/about/versions/16/behavior-changes-16
    tier: A
  - title: Android Developers — Predictive back gesture
    url: https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture
    tier: A
  - title: Apple HIG — Gestures
    url: https://developer.apple.com/design/human-interface-guidelines/gestures
    tier: A
    note: Shortcut gestures supplement standard navigation; the Back button must remain.
last_verified: 2026-08-08
```

```yaml
id: NAV-009
title: Navigation order and identification are consistent across screens
area: navigation
subcategory: consistency
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Navigation mechanisms repeated across screens SHOULD appear in the same
  relative order everywhere, and controls with the same function SHOULD be
  identified consistently (same icon, same label) throughout the app.
rationale: >-
  Users learn positions and symbols once and reuse them. Reordered menus or
  same-function controls with different icons force re-learning on every
  screen and cause mis-navigation.
applies_to: [tab bar, toolbar, menu, repeated action buttons]
good_examples:
  - "The share action uses the same icon and position on every content screen."
bad_examples:
  - "Settings reachable from a gear icon on one screen and an overflow menu labeled 'More' on another."
review_check: >-
  Comparing all screens, do repeated navigation elements keep the same
  relative order, and does every same-function control use the same icon and
  label?
related: [NAV-007]
sources:
  - title: WCAG 2.2 — 3.2.3 Consistent Navigation / 3.2.4 Consistent Identification (AA)
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: NN/g — 10 Usability Heuristics (#4 Consistency and standards)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

## 離脱時のデータ保護

```yaml
id: NAV-010
title: Confirm before dismissal that would discard unsaved input
area: navigation
subcategory: modality
severity: high
stability: core
platforms: [ios, android]
rule: >-
  If closing a modal or navigating back would discard unsaved user input, the
  app MUST ask for confirmation (or offer to save) before dismissing the view.
rationale: >-
  An accidental swipe or back tap silently destroying typed content is
  unrecoverable data loss from the user's perspective.
applies_to: [modal sheet, form screen, editor, back navigation]
exceptions:
  - Nothing has been entered or changed — then the view must close without friction.
  - Input is continuously auto-saved as a draft and recoverable.
good_examples:
  - "A compose sheet whose swipe-down shows 'Delete draft / Save draft / Cancel' when text exists."
bad_examples:
  - "A registration form that loses all fields when the user taps system back."
review_check: >-
  When the user backs out of each input surface with entered data, is a
  confirmation or auto-saved draft in place (and none shown when no data
  would be lost)?
related: [NAV-001, NAV-008, FORM-006]
sources:
  - title: Apple HIG — Modality
    url: https://developer.apple.com/design/human-interface-guidelines/modality
    tier: A
    note: Confirm before closing if data loss is possible.
  - title: WCAG 2.2 — 3.3.4 Error Prevention (Legal, Financial, Data) (AA)
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: NN/g — 10 Usability Heuristics (#5 Error prevention)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```
