# iOS Platform Conventions

iOS 固有の慣習。両OS共通の規範は各トピック領域（layout / navigation / components …）が正本であり、ここには **iOS にしか存在しない機構・慣習** のみを置く。

現行デザイン言語に関する注記: 2025年に導入された Liquid Glass（コントロール層がコンテンツ上に浮くガラス素材）は表現レイヤーの変更であり、44pt のタッチターゲット、17pt の本文既定、4.5:1 のコントラスト、モーダル／アラートの規範は変更されていない（`sources/research-notes/apple.md` の変更履歴で確認済み）。

```yaml
id: IOS-001
title: Use standard iOS components and navigation patterns
area: platform
subcategory: conventions
severity: medium
stability: convention
platforms: [ios]
rule: >-
  iOS apps SHOULD use standard system components and navigation structures
  (tab bar for sections, navigation stack for hierarchy, toolbars for actions),
  and MUST NOT reimplement a different platform's navigation chrome on iOS.
rationale: >-
  Standard components inherit accessibility, Dynamic Type, and appearance
  adaptation for free, and users apply system-wide expectations to them; a
  transplanted Android pattern breaks both.
applies_to:
  - navigation structure
  - controls and pickers
  - action placement
exceptions:
  - Deliberate brand experiences (e.g. games, immersive media) where the custom
    interface still meets accessibility and touch-target rules.
good_examples:
  - "A tab bar for sections with a navigation stack inside each tab."
bad_examples:
  - "A Material-style top app bar with a hamburger drawer as the primary navigation on iOS."
  - "A custom back button on the trailing edge."
review_check: >-
  Does the iOS design use system navigation structures and standard components
  rather than another platform's patterns?
related: [NAV-002, NAV-003, AND-003]
sources:
  - title: Apple HIG — Toolbars
    url: https://developer.apple.com/design/human-interface-guidelines/toolbars
    tier: A
  - title: Apple HIG — Tab bars
    url: https://developer.apple.com/design/human-interface-guidelines/tab-bars
    tier: A
last_verified: 2026-08-08
```

```yaml
id: IOS-002
title: Preserve the interactive back-swipe and system gestures
area: platform
subcategory: gestures
severity: high
stability: convention
platforms: [ios]
rule: >-
  The edge-swipe back gesture MUST continue to work on pushed screens, custom
  gestures MUST NOT conflict with system gestures (screen-edge swipes, control
  center, home indicator), and the visible Back control MUST remain even where
  the gesture exists.
rationale: >-
  The back swipe is the most used navigation action on iOS; disabling it strands
  users on screens they expected to leave with a habitual motion, and gesture
  conflicts cause unintended system actions.
applies_to:
  - pushed navigation screens
  - custom pan and swipe interactions
  - full-screen media and canvas views
exceptions:
  - Screens where leaving mid-task would lose data, which must still offer an
    explicit exit and confirm rather than silently disabling the gesture.
good_examples:
  - "A drawing canvas that reserves its pan gesture inside the canvas bounds and leaves the screen edges to the system."
bad_examples:
  - "Disabling interactive pop on every pushed screen to 'keep users in the flow'."
review_check: >-
  Does every pushed screen still support edge-swipe back, with custom gestures
  kept clear of system gesture areas?
related: [NAV-008, NAV-001, A11Y-002]
sources:
  - title: Apple HIG — Gestures
    url: https://developer.apple.com/design/human-interface-guidelines/gestures
    tier: A
    note: Shortcut gestures supplement standard navigation; the Back button must remain. Avoid conflicting with system gestures.
last_verified: 2026-08-08
```

```yaml
id: IOS-003
title: Follow current material and color conventions for bars
area: platform
subcategory: visual
severity: low
stability: current
platforms: [ios]
rule: >-
  On current iOS versions, bars SHOULD use the system material and scroll edge
  effects rather than custom opaque backgrounds, color SHOULD be applied sparingly
  and reserved for primary actions and status, and both light and dark color
  variants MUST be supplied even in a single-appearance app.
rationale: >-
  The current control layer adapts its appearance to the content behind it;
  custom bar backgrounds and broadly tinted controls break that adaptation and
  produce unreadable labels over some content.
values:
  ios: color the background of a prominent button rather than its label; prefer monochromatic bar labels over colorful content; do not tint multiple controls
applies_to:
  - toolbars and tab bars
  - buttons over content
  - custom themed screens
exceptions:
  - Fully custom immersive interfaces (games, media players) that supply their
    own chrome and meet contrast requirements.
good_examples:
  - "Letting the toolbar use the system material with a scroll edge effect over a photo grid."
bad_examples:
  - "Adding a custom opaque colored toolbar background and tinting every bar item."
review_check: >-
  Do bars use the system material and scroll edge effects, with color limited to
  primary actions and status, and light/dark variants defined for all custom colors?
related: [COLOR-004, COLOR-005]
sources:
  - title: Apple HIG — Color (Liquid Glass color guidance)
    url: https://developer.apple.com/design/human-interface-guidelines/color
    tier: A
  - title: Apple HIG — Layout (visual hierarchy)
    url: https://developer.apple.com/design/human-interface-guidelines/layout
    tier: A
last_verified: 2026-08-08
```
