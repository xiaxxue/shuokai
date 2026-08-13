# Gestures

ジェスチャー操作の設計。「アプリのジェスチャーがOSのジェスチャーと衝突する」問題と、「ジェスチャーが唯一の手段になっている」問題を扱う。

ジェスチャーに代替手段を用意する規範の正本は `rules/accessibility/accessibility.md`（A11Y-002）。ここでは**システムとの競合**と**標準ジェスチャーの意味の保全**を扱う。

一次情報の注記: Android の戻るジェスチャーの検知幅（端から何dpか）は公式ドキュメントで確認できず、端末・設定依存のため数値を規定しない。iOS の上端（通知センター）に関する規範は取得した本文で確認できず、明示されているのはコントロールセンターのみ。

```yaml
id: GEST-001
title: Do not redefine standard gestures
area: interaction
subcategory: system-conflict
severity: high
stability: convention
platforms: [ios, android]
rule: >-
  Standard system gestures MUST keep their documented meaning; an app MUST NOT
  assign a different action to a gesture the platform already defines, and MUST
  NOT invent a replacement for a standard action.
rationale: >-
  Users carry gesture expectations across every app on the device; an app that
  redefines one produces an unintended, sometimes destructive result from a
  motion the user performed automatically.
values:
  ios: standard gestures include tap, swipe, drag, pinch, edge swipe, shake to undo, and multi-finger system gestures
  android: back is an inward swipe from either the left or the right screen edge
applies_to:
  - swipe, pinch, long press, drag
  - shake and motion gestures
  - multi-finger gestures
exceptions:
  - Immersive experiences such as games and drawing canvases, where a custom
    gesture vocabulary is the interface — and which still must not block the
    system's own gestures (GEST-002).
good_examples:
  - "Swipe-down dismisses a sheet, as the platform defines."
bad_examples:
  - "Assigning 'delete' to a two-finger swipe that the platform uses for scrolling."
  - "Using shake for a custom action, overriding shake-to-undo."
review_check: >-
  Does every gesture in this design carry the meaning the platform documents for
  it, with no standard gesture reassigned?
related: [GEST-002, GEST-003, A11Y-002, IOS-002]
sources:
  - title: Apple HIG — Gestures
    url: https://developer.apple.com/design/human-interface-guidelines/gestures
    tier: A
  - title: Android Developers — Predictive back gesture
    url: https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture
    tier: A
last_verified: 2026-08-11
```

```yaml
id: GEST-002
title: Keep custom gestures clear of the system gesture areas
area: interaction
subcategory: system-conflict
severity: high
stability: current
platforms: [ios, android]
rule: >-
  Custom drag and swipe interactions MUST NOT be placed where they compete with
  system gestures — the screen edges used for back, and the bottom area used for
  home and app switching. Content MUST first be inset out of the gesture area;
  a gesture exclusion MUST be used only when insetting is impossible.
rationale: >-
  A control in the system gesture area either fails to receive the touch or steals
  a navigation the user needs, and the home and app-switch gestures cannot be
  opted out of at all, so a design that depends on that area is unfixable.
values:
  android: exclusion rectangles are capped at 200dp of vertical extent per edge; the cap does not apply while the navigation bar is stickily hidden, nor to the IME or home activity. Home and quick-switch gestures cannot be excluded at all
  android_order: inset content using the system gesture insets first; use setSystemGestureExclusionRects only as an escape hatch
  ios: preferredScreenEdgesDeferringSystemGestures (iOS 11+) defers system edge gestures, and is intended for immersive apps
applies_to:
  - sliders, carousels, and drawers near the screen edges
  - drawing and map canvases
  - bottom sheets with drag handles
  - full-screen media controls
exceptions:
  - Standard platform components, which already opt out where appropriate.
good_examples:
  - "Insetting a horizontal slider away from the left and right edges so the back gesture still works."
bad_examples:
  - "A full-bleed image carousel occupying the left edge, so back never triggers."
  - "Placing a precise drag control across the bottom of the screen where home is."
review_check: >-
  Is every custom drag or swipe target inset away from the screen edges and the
  bottom home area, with exclusions used only where insetting was impossible?
related: [GEST-001, GEST-003, SPACE-001, AND-002]
sources:
  - title: Android Developers — View.setSystemGestureExclusionRects
    url: https://developer.android.com/reference/android/view/View
    tier: A
    note: The system limits exclusions to 200dp of vertical extent per edge; the limit does not apply when the navigation bar is stickily hidden, nor to the IME or home activity.
  - title: Android Developers — Gesture navigation
    url: https://developer.android.com/training/gestures/gesturenav
    tier: A
  - title: Apple HIG — Gestures
    url: https://developer.apple.com/design/human-interface-guidelines/gestures
    tier: A
last_verified: 2026-08-11
```

```yaml
id: GEST-003
title: Edge swipes supplement visible controls, never replace them
area: interaction
subcategory: discoverability
severity: high
stability: core
platforms: [ios, android]
rule: >-
  The existence of an edge-swipe back gesture MUST NOT be used as a reason to
  omit a visible back or close control, and shortcut gestures MUST duplicate an
  action that is already reachable through visible UI.
rationale: >-
  Gestures are invisible: users who do not know one exists cannot discover it,
  and users who cannot perform it are excluded entirely — so a gesture-only exit
  is a dead end for both groups.
applies_to:
  - pushed screens and modals
  - swipe-to-dismiss surfaces
  - shortcut gestures
exceptions:
  - Root screens where the tab bar itself is the exit.
good_examples:
  - "A photo viewer with both swipe-down dismissal and a visible Close button."
bad_examples:
  - "Removing the Back button because 'users can swipe from the edge'."
review_check: >-
  Does every screen keep a visible back or close control regardless of which
  gestures it also supports?
related: [NAV-001, GEST-001, A11Y-002, IOS-002]
sources:
  - title: Apple HIG — Gestures
    url: https://developer.apple.com/design/human-interface-guidelines/gestures
    tier: A
    note: Shortcut gestures supplement standard navigation; the Back button must remain.
  - title: Android Developers — Gesture navigation
    url: https://developer.android.com/training/gestures/gesturenav
    tier: A
last_verified: 2026-08-11
```

```yaml
id: GEST-004
title: Custom gestures must be discoverable and simple
area: interaction
subcategory: discoverability
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  A custom gesture SHOULD be introduced only when a visible control cannot serve
  the purpose, MUST be discoverable through some visible affordance or hint, and
  SHOULD avoid multi-finger and timing-dependent input for frequent actions.
rationale: >-
  An undiscoverable gesture is functionally absent for most users, and complex
  gestures exclude anyone with limited dexterity while adding nothing a button
  could not do.
applies_to:
  - swipe actions on rows
  - custom pan and pinch interactions
  - long-press shortcuts
exceptions:
  - Accelerators for expert users that duplicate a visible control.
good_examples:
  - "A partially revealed swipe action hinting that the row can be swiped, with the same action in the row's menu."
bad_examples:
  - "A three-finger double tap as the only way to reach a settings screen."
review_check: >-
  Does each custom gesture have a visible hint or affordance, avoid multi-finger
  and timing-based input for frequent actions, and duplicate a visible control?
related: [GEST-003, A11Y-002, A11Y-005, LIST-003]
sources:
  - title: Apple HIG — Gestures
    url: https://developer.apple.com/design/human-interface-guidelines/gestures
    tier: A
  - title: Apple HIG — Accessibility
    url: https://developer.apple.com/design/human-interface-guidelines/accessibility
    tier: A
    note: Prefer the simplest gesture possible for frequent interactions; avoid custom multifinger gestures.
last_verified: 2026-08-11
```
