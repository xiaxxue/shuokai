# Touch Targets

タップ可能要素の寸法と間隔。ここが最小ヒット領域の正本であり、`rules/accessibility/` や `rules/components/` からは TOUCH-001 を参照する。

プラットフォーム値（iOS 44pt / Android 48dp）は WCAG 2.5.8 の 24px より厳しく、モバイルアプリでは常にプラットフォーム値を採用する。

```yaml
id: TOUCH-001
title: Minimum touch target size
area: layout
subcategory: touch-targets
severity: high
stability: convention
platforms: [ios, android]
rule: >-
  Every interactive element MUST have a hit region of at least 44x44 pt on iOS
  and 48x48 dp on Android, even when the visible glyph or label is smaller.
rationale: >-
  Targets smaller than the average fingertip contact area cause mis-taps and
  exclude users with limited motor control.
values:
  ios: 44x44 pt (HIG general rule; 28x28 pt is an absolute accessibility floor, not a design target)
  android: 48x48 dp (retained even if the visual element is smaller)
  wcag: 24x24 CSS px (2.5.8, AA) / 44x44 CSS px (2.5.5, AAA) — platform values are stricter and take precedence
applies_to:
  - button
  - icon-button
  - checkbox, radio, switch
  - tab and navigation item
  - interactive list item and its inline actions
  - close and back controls
exceptions:
  - Inline links inside body text, which are constrained by the line box (WCAG 2.5.8 "inline" exception).
  - An equivalent control meeting the minimum exists elsewhere on the same screen.
good_examples:
  - "A 24dp icon centered inside a 48x48dp touch area."
  - "A 20pt close glyph with an expanded 44x44pt tap region."
bad_examples:
  - "A 24x24dp icon whose tappable area equals the icon bounds."
  - "A text link styled as a button with only 32pt height."
review_check: >-
  Does every tappable element on each screen have a hit region of at least 44pt
  (iOS) / 48dp (Android), including icon-only controls whose visible size is smaller?
related: [TOUCH-002, TOUCH-003, A11Y-005, LIST-003]
sources:
  - title: Apple HIG — Buttons
    url: https://developer.apple.com/design/human-interface-guidelines/buttons
    tier: A
    note: A button needs a hit region of at least 44x44 pt.
  - title: Apple HIG — Accessibility
    url: https://developer.apple.com/design/human-interface-guidelines/accessibility
    tier: A
    note: iOS default control size 44x44 pt.
  - title: Material Design 3 — Grids & spacing / Density
    url: https://m3.material.io/foundations/layout/grids-spacing/density
    tier: A
    note: Accessible targets retain a minimum of 48x48dp even if the visual element is smaller.
  - title: Android Developers — Make apps more accessible
    url: https://developer.android.com/guide/topics/ui/accessibility/apps
    tier: A
  - title: WCAG 2.2 — 2.5.8 Target Size (Minimum)
    url: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
    tier: A
last_verified: 2026-08-08
```

```yaml
id: TOUCH-002
title: Separate adjacent targets, especially opposing actions
area: layout
subcategory: touch-targets
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Adjacent interactive elements SHOULD be padded so their hit regions do not
  touch, and controls whose outcomes conflict (e.g. confirm and delete) MUST NOT
  be placed immediately next to each other without additional separation.
rationale: >-
  Size alone does not prevent mis-taps; when a destructive control sits beside a
  frequent one, an off-by-a-few-millimeters tap causes an unintended, sometimes
  irreversible result.
values:
  ios: about 12 pt padding around bezeled controls, about 24 pt around bezel-less controls (HIG guidance)
  nng: roughly 2 mm minimum between opposing actions
  wcag: targets pass 2.5.8 via the spacing exception when 24 CSS px circles at their centers do not intersect
applies_to:
  - toolbars and action rows
  - list item inline actions
  - dialog button pairs
  - segmented controls
exceptions:
  - Dense grids of equivalent, non-destructive choices (e.g. a calendar or number pad),
    where the targets themselves meet TOUCH-001 and no option is destructive.
good_examples:
  - "Delete placed in an overflow menu while Share stays in the toolbar."
bad_examples:
  - "A trash icon rendered directly beside a favorite icon in a list row with no gap."
review_check: >-
  Are the hit regions of adjacent controls separated by visible padding, and is
  no destructive control immediately adjacent to a frequently used one?
related: [TOUCH-001, DESTR-003]
sources:
  - title: Apple HIG — Accessibility (spacing between controls)
    url: https://developer.apple.com/design/human-interface-guidelines/accessibility
    tier: A
  - title: NN/g — Touch Targets on Touchscreens
    url: https://www.nngroup.com/articles/touch-target-size/
    tier: B
    note: Roughly 2mm between opposing actions; minimum physical target 1cm x 1cm.
last_verified: 2026-08-08
```

```yaml
id: TOUCH-003
title: Enlarge targets for primary and on-the-go actions
area: layout
subcategory: touch-targets
severity: suggestion
stability: core
platforms: [ios, android]
rule: >-
  Primary calls to action, high-frequency controls, and controls used while
  walking or by children and older adults SHOULD exceed the minimum target size
  rather than sit exactly at it.
rationale: >-
  The platform minimums are floors measured under favorable conditions; motion,
  reduced dexterity, and one-handed use all degrade tapping accuracy.
applies_to:
  - primary call to action
  - high-frequency controls
  - apps used in motion or by broad age ranges
exceptions:
  - Dense professional tools where screen real estate is the binding constraint
    and every target still meets TOUCH-001.
good_examples:
  - "A 56dp-tall primary submit button in a payment flow."
bad_examples:
  - "A checkout button sized to exactly 48dp squeezed between two secondary links."
review_check: >-
  Is the primary action on each screen visibly larger than the minimum target size?
related: [TOUCH-001, BTN-001]
sources:
  - title: NN/g — Touch Targets on Touchscreens
    url: https://www.nngroup.com/articles/touch-target-size/
    tier: B
last_verified: 2026-08-08
```
