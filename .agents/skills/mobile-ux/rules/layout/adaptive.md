# Adaptive Layout

ウィンドウサイズ・向き・折りたたみ状態への適応。**「タブレット対応」ではなく「ウィンドウ適応」の問題**として扱う — 同じ端末でも分割画面・回転・折りたたみでサイズは常時変わる。

セーフエリアとインセットは `rules/layout/spacing-and-safe-area.md`（SPACE-001）が正本。ここでは寸法クラスに応じた**構造の切り替え**を扱う。

一次情報の注記: iOS の size class は compact / regular の2値のみで、Apple は pt の境界値を公表していない（端末×向きの表として提供）。したがって本ルール群は Android の dp 境界のみを数値として持ち、iOS 側は「regular 幅かどうか」で表現する。行長の上限文字数は現行の一次情報で確認できなかったため規定しない。

```yaml
id: ADAPT-001
title: Branch layout on window size, never on device type
area: layout
subcategory: responsive
severity: high
stability: current
platforms: [ios, android]
rule: >-
  Layout decisions MUST be derived from the window size currently allocated to
  the app; they MUST NOT be derived from device model, an `isTablet`-style flag,
  or raw physical display metrics.
rationale: >-
  The window an app occupies changes during its lifetime through rotation,
  split-screen, folding, and free-form resizing, so a decision made once from the
  device identity is wrong for most of the states the app will actually be in.
values:
  android_width: compact < 600dp / medium 600–839dp / expanded 840–1199dp / large 1200–1599dp / extra-large ≥ 1600dp
  android_height: compact < 480dp / medium 480–899dp / expanded ≥ 900dp
  android_note: the large and extra-large buckets are only surfaced when adaptive info is requested with large/extra-large support enabled; otherwise expanded is the top bucket
  ios: only compact / regular per axis; Apple publishes a device × orientation table rather than point thresholds
applies_to:
  - top-level screen scaffolds
  - navigation structure selection
  - single-pane vs multi-pane decisions
  - grid column counts
exceptions:
  - Leaf components sizing themselves from their own available space rather than
    from a global size class — which is the recommended structure, not an exception to it.
good_examples:
  - "Selecting list-detail vs single-pane from the current width size class, re-evaluated on every configuration change."
bad_examples:
  - "`if (isTablet) { twoPane() }`, which stays two-pane when the tablet is put in a narrow split-screen window."
  - "Reading the physical screen size once at startup and caching the layout decision."
review_check: >-
  Is every layout branch in this design expressed in terms of the current window
  size class, with no branch keyed to device type or physical screen size?
related: [ADAPT-002, ADAPT-004, SPACE-001]
sources:
  - title: Android Developers — Window size classes
    url: https://developer.android.com/develop/ui/compose/layouts/adaptive/window-size-classes
    tier: A
    note: Size classes are based on the window available to the app, not the device, and change during the app lifetime.
  - title: Apple HIG — Layout (size classes)
    url: https://developer.apple.com/design/human-interface-guidelines/layout
    tier: A
last_verified: 2026-08-11
```

```yaml
id: ADAPT-002
title: Do not rely on orientation locking on large screens
area: layout
subcategory: orientation
severity: high
stability: current
platforms: [ios, android]
rule: >-
  Designs MUST work in both portrait and landscape on large screens; on Android
  the app MUST NOT depend on a fixed orientation, aspect ratio, or
  non-resizability, because the system ignores those declarations there.
rationale: >-
  An app that assumes a locked orientation on a large screen renders stretched,
  clipped, or with controls off-screen the moment the system disregards the
  declaration — which it now does by default.
values:
  android: for apps targeting API 36, orientation / resizability / aspect-ratio restrictions are ignored on displays with smallest width ≥ 600dp, in both full-screen and multi-window; `screenOrientation`, `resizeableActivity`, `minAspectRatio`, `maxAspectRatio`, and `setRequestedOrientation()` all have no effect there
  android_exceptions: games (declared via `appCategory`), users who opt in via device aspect-ratio settings, and displays below sw600dp
  ios: the HIG directs apps to support both portrait and landscape
applies_to:
  - all screens on tablets, foldables, and desktop-class windows
  - media and camera screens
  - forms and long content
exceptions:
  - Games, which the platform excepts explicitly.
  - Displays below sw600dp on Android, which still honor the declaration.
good_examples:
  - "A capture screen that reflows its controls to the trailing edge in landscape instead of assuming portrait."
bad_examples:
  - "Declaring `screenOrientation=portrait` and designing only the portrait layout, then shipping to tablets."
  - "Treating `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` as a permanent solution — it stops working at API 37."
review_check: >-
  Has a landscape layout been designed for every screen that a tablet or foldable
  user can reach, without depending on an orientation or aspect-ratio lock?
related: [ADAPT-001, ADAPT-003, AND-002]
sources:
  - title: Android 16 behavior changes — orientation and resizability restrictions
    url: https://developer.android.com/about/versions/16/behavior-changes-16
    tier: A
    note: Ignored on sw ≥ 600dp for apps targeting API 36; the manifest opt-out is temporary and does not apply at API 37+.
  - title: Android Developers — Adaptive app quality, tier 3
    url: https://developer.android.com/develop/adaptive-apps/quality-guidelines/adaptive-app-quality/tier-3
    tier: A
  - title: Apple HIG — Layout
    url: https://developer.apple.com/design/human-interface-guidelines/layout
    tier: A
last_verified: 2026-08-11
```

```yaml
id: ADAPT-003
title: Preserve user work across configuration changes
area: layout
subcategory: continuity
severity: critical
stability: core
platforms: [ios, android]
rule: >-
  Rotation, folding or unfolding, and window resizing MUST NOT lose user work:
  scroll position, text being entered, keyboard state, selection, and media
  playback position MUST survive the change, including combinations of changes.
rationale: >-
  These events are user-initiated and frequent, and on current Android versions
  they occur more often because orientation locks no longer suppress them; losing
  entered text to a rotation is indistinguishable from a crash to the user.
values:
  android: quality requirements `Config_Changes` (scroll position, input text and keyboard state, media position) and `Config_Combinations` (rotation + resize, rotation + fold)
  ios: the system restores window size and placement across launches, so the app must restore matching content state
applies_to:
  - forms and editors
  - scrollable lists
  - media playback
  - multi-step flows
exceptions:
  - Deliberate resets the user requested.
good_examples:
  - "Rotating mid-form keeps every entered value, the caret position, and the open keyboard."
bad_examples:
  - "Unfolding the device restarts the screen and clears a half-written message."
review_check: >-
  For each screen holding user input or position, is the state preserved across
  rotation, fold/unfold, and resize — including two of them in combination?
related: [ADAPT-004, FORM-006, AND-002]
sources:
  - title: Android Developers — Adaptive app quality, tier 3
    url: https://developer.android.com/develop/adaptive-apps/quality-guidelines/adaptive-app-quality/tier-3
    tier: A
  - title: Android 16 behavior changes
    url: https://developer.android.com/about/versions/16/behavior-changes-16
    tier: A
    note: Rotation causes activity recreation more often once orientation restrictions are ignored.
  - title: Apple HIG — Windows
    url: https://developer.apple.com/design/human-interface-guidelines/windows
    tier: A
last_verified: 2026-08-11
```

```yaml
id: ADAPT-004
title: Hoist state that is hidden at some window sizes
area: layout
subcategory: continuity
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  State belonging to UI that exists only at some window sizes SHOULD be held
  above the size-dependent branch, so that narrowing and re-widening the window
  does not reset it.
rationale: >-
  When expansion state, selection, or scroll position lives inside the wide-layout
  branch, it is destroyed the moment the window narrows, and the user finds their
  context silently reset on the way back.
applies_to:
  - expand/collapse disclosures
  - selected item in list-detail
  - side panel and inspector state
exceptions:
  - State that is genuinely meaningless outside the wide layout.
good_examples:
  - "The selected list item is held at the screen level, so it is still selected when the detail pane reappears."
bad_examples:
  - "A 'show more' toggle stored inside the two-pane branch that collapses whenever the window is briefly narrowed."
review_check: >-
  For each control that exists only at some window sizes, is its state held above
  the size branch so it survives a narrow-then-widen cycle?
related: [ADAPT-003, ADAPT-005]
sources:
  - title: Android Developers — Support different screen sizes
    url: https://developer.android.com/guide/topics/large-screens/support-different-screen-sizes
    tier: A
last_verified: 2026-08-11
```

```yaml
id: ADAPT-005
title: Choose a canonical multi-pane layout instead of stretching
area: layout
subcategory: responsive
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  At wide window sizes, screens SHOULD adopt a multi-pane or multi-column
  structure appropriate to their content rather than stretching a phone layout,
  and the current selection MUST stay visible when panes appear or disappear.
rationale: >-
  A stretched single-column layout wastes the added space and produces
  uncomfortably long lines, while a pane transition that drops the selection makes
  the user re-navigate to where they already were.
values:
  android_list_detail: side-by-side at expanded width (≥ 840dp), one pane at medium and compact with back returning to the list; selection is preserved across the transition
  android_supporting_pane: roughly 70/30 at expanded, 50/50 at medium, below or in a sheet at compact
  android_feed: grid columns scale with width rather than switching at a discrete breakpoint
  ios: prefer split views only in a regular-width environment; persistently highlight the current selection in each pane
applies_to:
  - list screens with detail views
  - content with dependent secondary panes (comments, related items, inspectors)
  - feeds and grids
exceptions:
  - Single-purpose screens with no secondary content, which may center a
    width-limited column instead.
good_examples:
  - "A mail list that becomes list + message side by side at expanded width, keeping the opened message selected."
bad_examples:
  - "A phone list layout stretched to 1280dp with each row spanning the full width."
  - "Widening the window loses which item was open and returns to an empty detail pane."
review_check: >-
  For each list or content screen, is the wide-window structure defined (which
  panes appear and at which size class), and is the current selection preserved
  when the structure changes?
related: [ADAPT-001, ADAPT-006, LIST-002]
sources:
  - title: Android Developers — Canonical layouts
    url: https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts
    tier: A
  - title: Android Developers — Adaptive app quality, tier 2
    url: https://developer.android.com/develop/adaptive-apps/quality-guidelines/adaptive-app-quality/tier-2
    tier: A
  - title: Apple HIG — Split views
    url: https://developer.apple.com/design/human-interface-guidelines/split-views
    tier: A
last_verified: 2026-08-11
```

```yaml
id: ADAPT-006
title: Do not stretch secondary UI to the full window width
area: layout
subcategory: responsive
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  On wide windows, buttons, text fields, bottom sheets, and modals MUST have a
  bounded width rather than spanning the full window, and modals SHOULD NOT cover
  the whole screen when the surrounding context matters.
rationale: >-
  A control stretched across a wide window separates its label from its edges,
  becomes hard to associate with what it acts on, and a full-screen modal on a
  large display destroys the context the user was working in.
values:
  android: bottom sheets need a maximum width; buttons, text fields, and boxes must not be full width; modals and edit menus must not cover the entire screen; context menus appear next to the selected item
  ios: avoid full-width buttons and respect system-defined standard margins
  numeric_max: not published by either platform — bound the width relative to the content, not to a fixed number
applies_to:
  - buttons and form fields
  - bottom sheets and dialogs
  - context and edit menus
exceptions:
  - Compact windows, where full-width controls are the platform norm on Android.
  - watchOS, where full-width primary buttons are preferred.
good_examples:
  - "A dialog constrained to a readable width and centered on a tablet."
bad_examples:
  - "A 1600dp-wide Save button."
  - "A confirmation sheet that covers a whole desktop-sized window."
review_check: >-
  At the widest supported window, is every button, field, sheet, and modal
  bounded to a readable width rather than spanning the window?
related: [ADAPT-005, IOS-003, TYPE-005]
sources:
  - title: Android Developers — Adaptive app quality, tier 2
    url: https://developer.android.com/develop/adaptive-apps/quality-guidelines/adaptive-app-quality/tier-2
    tier: A
  - title: Apple HIG — Layout
    url: https://developer.apple.com/design/human-interface-guidelines/layout
    tier: A
last_verified: 2026-08-11
```

```yaml
id: ADAPT-007
title: Keep content and controls clear of the fold
area: layout
subcategory: foldables
severity: medium
stability: current
platforms: [android]
rule: >-
  On foldable devices, important content and interactive controls MUST NOT be
  placed within the folding feature's bounds, and controls SHOULD NOT sit close
  to the fold while it separates the display; the fold SHOULD be used as a
  boundary between content areas instead.
rationale: >-
  A control under a fully occluding hinge is invisible and untappable, and one
  placed at a separating fold is physically awkward to reach.
values:
  api: read the folding feature's bounds, orientation, occlusion type, and separating flag at runtime — no hinge angle API exists and geometry is device-specific
  postures: tabletop = half-opened + horizontal (split content top/bottom); book = half-opened + vertical (split left/right)
applies_to:
  - full-screen media and canvases
  - two-pane layouts on unfolded displays
  - primary action placement
exceptions:
  - Devices reporting no folding feature.
good_examples:
  - "A video player that puts the video above a horizontal fold and the controls below it in tabletop posture."
bad_examples:
  - "A primary action button rendered at the vertical center of an unfolded display, under the hinge."
  - "Assuming every foldable reports a half-opened state — trifolds do not."
review_check: >-
  Does the design read the folding feature at runtime and keep controls and key
  content outside its bounds, rather than assuming a posture or hinge position?
related: [ADAPT-001, SPACE-001]
sources:
  - title: Android Developers — Make your app fold aware
    url: https://developer.android.com/develop/adaptive-apps/guides/foldables/make-your-app-fold-aware
    tier: A
last_verified: 2026-08-11
```

```yaml
id: ADAPT-008
title: Adapt the navigation component to the window, not to the device
area: layout
subcategory: navigation
severity: medium
stability: current
platforms: [android]
rule: >-
  Android navigation SHOULD switch from a bottom navigation bar to a navigation
  rail as the window widens, and rails SHOULD expand into a navigation panel at
  the largest sizes; a navigation drawer SHOULD NOT be treated as the large-screen
  destination.
rationale: >-
  A bottom bar wastes reachable horizontal space and is far from the hand on a
  wide window, while the drawer hides destinations behind an extra tap that a
  wide window has no need for.
values:
  selection: a bar is used when the width **or the height** is compact, or in tabletop posture; a rail otherwise
  note: a phone in landscape has compact height and therefore keeps the bottom bar — the switch is not driven by width alone
  destination_counts: not published on the current adaptive-navigation page (未確認); the 3–5 bottom-bar range in NAV-002 comes from the Material navigation bar guidance
applies_to:
  - top-level navigation on tablets, foldables, and resized windows
exceptions:
  - Apps deliberately overriding the selection, e.g. using a drawer at expanded
    width, which the platform permits.
good_examples:
  - "Bottom bar on a phone, rail on an unfolded foldable, expanded rail on a desktop-sized window."
bad_examples:
  - "A bottom navigation bar spanning a 1280dp-wide window."
  - "Switching to a rail on a landscape phone, where the height is compact."
review_check: >-
  Does the navigation component switch by window size class (including the
  compact-height and tabletop conditions), and does the design avoid treating a
  drawer as the wide-window endpoint?
related: [NAV-002, AND-003, ADAPT-001]
sources:
  - title: Android Developers — Build adaptive navigation
    url: https://developer.android.com/develop/ui/compose/layouts/adaptive/build-adaptive-navigation
    tier: A
  - title: Android Developers — Adaptive app quality, tier 2
    url: https://developer.android.com/develop/adaptive-apps/quality-guidelines/adaptive-app-quality/tier-2
    tier: A
    note: Rails replace bars on large screens; drawers should be updated to expanded rails.
last_verified: 2026-08-11
```
