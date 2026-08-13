# Spacing and Safe Area

余白の一貫性、セーフエリア／インセット、スクロールとリフローのルール。

一次情報の注記: 「16dp/16pt の標準画面マージン」「8dp グリッド」は現行の Apple HIG / Material 3 のページからは規範文として確認できなかったため、本ルール集は**具体的なマージン数値を規定しない**。代わりに「システム定義のマージンとセーフエリアを尊重する」「アプリ内で一貫した間隔スケールを使う」を規範とする（`sources/research-notes/` 参照）。

```yaml
id: SPACE-001
title: Respect safe areas and system insets
area: layout
subcategory: safe-area
severity: high
stability: current
platforms: [ios, android]
rule: >-
  Interactive content and essential information MUST be laid out inside the
  system-provided safe area / window insets, so nothing is covered by the status
  bar, display cutout, home indicator, navigation bar, or the software keyboard.
rationale: >-
  Content placed under system UI is unreadable or untappable, and on current OS
  versions apps are drawn edge-to-edge by default, so ignoring insets is a
  visible defect rather than an edge case.
values:
  android: apps targeting SDK 35+ are displayed edge-to-edge on Android 15+; for SDK 36 the opt-out attribute is deprecated and disabled — insets MUST be handled (systemBars, displayCutout, systemGestures)
  ios: respect system-defined safe areas, margins, and layout guides; backgrounds may extend to the edges while controls stay inside
applies_to:
  - top and bottom app chrome
  - floating action buttons and sticky footers
  - full-screen media
  - scrollable content ends
exceptions:
  - Decorative backgrounds and full-bleed imagery, which may extend beneath system UI.
good_examples:
  - "A submit button pinned above the home indicator using bottom safe-area inset."
bad_examples:
  - "A bottom bar drawn behind the gesture navigation bar so its buttons are half covered."
review_check: >-
  Is every interactive control and essential text positioned inside the safe area
  and window insets on both platforms, including when the keyboard is shown?
related: [SPACE-002, AND-002, IOS-002]
sources:
  - title: Apple HIG — Layout (safe areas)
    url: https://developer.apple.com/design/human-interface-guidelines/layout
    tier: A
  - title: Android Developers — Display content edge-to-edge
    url: https://developer.android.com/develop/ui/views/layout/edge-to-edge
    tier: A
  - title: Android 16 behavior changes
    url: https://developer.android.com/about/versions/16/behavior-changes-16
    tier: A
    note: windowOptOutEdgeToEdgeEnforcement is deprecated and disabled for apps targeting SDK 36.
last_verified: 2026-08-08
```

```yaml
id: SPACE-002
title: Keep the focused input visible above the keyboard
area: layout
subcategory: keyboard
severity: high
stability: core
platforms: [ios, android]
rule: >-
  When a text input receives focus, the field, its label, and its error message
  MUST remain visible above the software keyboard, and the primary submit action
  MUST remain reachable without dismissing the keyboard.
rationale: >-
  If the keyboard covers the focused field or its error text, users type blind
  and cannot see why their input was rejected.
values:
  wcag: 2.4.11 Focus Not Obscured (Minimum) — a focused component must not be entirely hidden by author-created content (AA)
applies_to:
  - forms
  - search fields
  - comment and message composers
  - bottom sheets containing inputs
exceptions:
  - Full-screen editors where the toolbar intentionally attaches to the keyboard.
good_examples:
  - "The content view scrolls so the focused field and its error sit above the keyboard."
bad_examples:
  - "A login form where the password error is rendered under the keyboard."
review_check: >-
  With the keyboard open, are the focused field, its label, its error text, and
  the submit path all still visible or reachable?
related: [SPACE-001, FORM-005, A11Y-003]
sources:
  - title: WCAG 2.2 — 2.4.11 Focus Not Obscured (Minimum)
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: Apple HIG — Layout
    url: https://developer.apple.com/design/human-interface-guidelines/layout
    tier: A
last_verified: 2026-08-08
```

```yaml
id: SPACE-003
title: Avoid two-dimensional scrolling and nested scroll areas
area: layout
subcategory: scrolling
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Screens MUST NOT require horizontal and vertical scrolling to read the same
  content, and a vertically scrolling region SHOULD NOT be nested inside another
  vertically scrolling region.
rationale: >-
  Two-dimensional scrolling hides content that users never discover, and nested
  same-axis scroll areas make it ambiguous which region will move, causing users
  to get stuck partway through a list.
values:
  wcag: 1.4.10 Reflow — content presentable without two-dimensional scrolling at 320 CSS px width / 256 CSS px height (AA)
applies_to:
  - long content screens
  - forms inside sheets
  - lists inside cards
  - map and table screens
exceptions:
  - Content whose two-dimensional layout is essential — tables, maps, diagrams,
    and horizontally paged carousels of discrete items.
good_examples:
  - "A single vertical scroll containing a horizontally paging carousel of cards."
bad_examples:
  - "A scrollable comment list embedded in the middle of a scrollable detail screen."
review_check: >-
  Does each screen scroll along a single axis for its main content, with no
  vertically scrolling region nested inside another?
related: [TYPE-001, LIST-002]
sources:
  - title: WCAG 2.2 — 1.4.10 Reflow
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: Apple HIG — Layout (adaptability)
    url: https://developer.apple.com/design/human-interface-guidelines/layout
    tier: A
last_verified: 2026-08-08
```

```yaml
id: SPACE-004
title: Use one consistent spacing scale
area: layout
subcategory: spacing
severity: low
stability: convention
platforms: [ios, android]
rule: >-
  Spacing SHOULD come from a single defined scale used throughout the app, and
  related elements SHOULD be grouped by proximity so that visual grouping matches
  logical grouping.
rationale: >-
  Arbitrary per-screen spacing produces a rhythm-less layout, and when unrelated
  items sit closer together than related ones, users misread the structure.
values:
  material: the component density scale steps in 4dp increments; density must never reduce targets below 48x48dp
applies_to:
  - screen margins
  - gaps between sections
  - list and card internal padding
  - form field spacing
exceptions:
  - Deliberate optical adjustments around icons and glyphs.
good_examples:
  - "A defined scale (e.g. 4/8/16/24) applied consistently, with larger gaps between sections than within them."
bad_examples:
  - "Margins of 13, 15, and 18 points on three consecutive sections of the same screen."
review_check: >-
  Do all spacing values in this design come from one declared scale, and are
  related elements visually closer to each other than to unrelated ones?
related: [FOUND-005, SPACE-001]
sources:
  - title: Material Design 3 — Grids & spacing (grouping and rhythm)
    url: https://m3.material.io/foundations/layout/grids-spacing/spacing
    tier: A
    note: Current page is qualitative; the 8dp-grid figure is not stated normatively.
  - title: Material Design 3 — Density
    url: https://m3.material.io/foundations/layout/grids-spacing/density
    tier: A
last_verified: 2026-08-08
```
