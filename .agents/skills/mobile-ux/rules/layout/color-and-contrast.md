# Color and Contrast

色の使い方とコントラスト。テキストコントラストの正本は COLOR-001、色のみで情報を伝えない規範の正本は COLOR-003。
`rules/accessibility/` からはこれらを参照する。

```yaml
id: COLOR-001
title: Minimum text contrast ratio
area: layout
subcategory: contrast
severity: critical
stability: core
platforms: [ios, android]
rule: >-
  Text MUST have a contrast ratio of at least 4.5:1 against its background;
  large text MAY use 3:1. Contrast MUST be verified in both light and dark
  appearance.
rationale: >-
  Below these ratios, text is unreadable for users with low vision and for
  anyone in bright ambient light, which can make essential information inaccessible.
values:
  wcag: 4.5:1 normal text, 3:1 large text (1.4.3, AA)
  ios: text up to 17 pt 4.5:1; 18 pt and above 3:1; bold text of any size 3:1
  android: 4.5:1 below 18sp (or bold below 14sp), 3:1 otherwise
applies_to:
  - body text
  - labels on buttons and controls
  - placeholder and helper text
  - text over images and gradients
exceptions:
  - Inactive (disabled) components, pure decoration, and logotypes.
good_examples:
  - "Secondary label using the system secondary label color that meets 4.5:1 in both appearances."
bad_examples:
  - "Light gray (#AAAAAA) helper text on white."
  - "White text placed over a photograph with no scrim."
review_check: >-
  Does every text element meet at least 4.5:1 contrast (3:1 for large text) in
  both light and dark appearance, including text over images?
related: [COLOR-002, COLOR-004, TYPE-003, A11Y-004]
sources:
  - title: WCAG 2.2 — 1.4.3 Contrast (Minimum)
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: Apple HIG — Accessibility (color contrast)
    url: https://developer.apple.com/design/human-interface-guidelines/accessibility
    tier: A
    note: Accessibility Inspector uses WCAG AA values; check both light and dark appearance.
  - title: Android Developers — Make apps more accessible
    url: https://developer.android.com/guide/topics/ui/accessibility/apps
    tier: A
  - title: デジタル庁デザインシステム — Color
    url: https://design.digital.go.jp/dads/foundations/color/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: COLOR-002
title: Non-text UI elements meet 3:1 contrast
area: layout
subcategory: contrast
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Visual boundaries and indicators that convey meaning — input field borders,
  icon-only controls, selection and focus indicators, state indicators — MUST
  have a contrast ratio of at least 3:1 against adjacent colors.
rationale: >-
  If a control's boundary or state indicator is invisible, users cannot tell what
  is interactive or which item is currently selected.
values:
  wcag: 3:1 (1.4.11 Non-text Contrast, AA)
  android: enabled buttons 3:1 against background; navigation bar active/inactive icons 3:1 against the container
applies_to:
  - text field borders
  - icon buttons
  - active tab indicators
  - toggle and checkbox states
  - focus indicators
exceptions:
  - Inactive components and elements whose appearance is fully determined by the platform.
good_examples:
  - "An outlined text field whose border meets 3:1 against the surface."
bad_examples:
  - "A selected tab distinguished only by a pale tint below 3:1."
review_check: >-
  Do all meaningful borders, icons, and selection or focus indicators meet 3:1
  contrast against their adjacent background?
related: [COLOR-001, COLOR-003, A11Y-006]
sources:
  - title: WCAG 2.2 — 1.4.11 Non-text Contrast
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: Material Design 3 — Buttons accessibility
    url: https://m3.material.io/components/buttons/accessibility
    tier: A
  - title: Material Design 3 — Navigation bar guidelines
    url: https://m3.material.io/components/navigation-bar/guidelines
    tier: A
last_verified: 2026-08-08
```

```yaml
id: COLOR-003
title: Never convey information by color alone
area: layout
subcategory: color-semantics
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Color MUST NOT be the only means of conveying state, interactivity, errors, or
  differences between items; it MUST be paired with text, an icon, a shape, or a
  position difference.
rationale: >-
  Color-blind users, users in grayscale or high-contrast modes, and users in poor
  lighting cannot perceive the distinction, so the information disappears entirely.
applies_to:
  - error and success states
  - required field indicators
  - chart and category legends
  - selected or active items
  - links inside text
exceptions:
  - Purely decorative color that duplicates information already given in text.
good_examples:
  - "An error field showing a red border, an error icon, and an error message in text."
  - "A status list showing both a colored dot and a status word."
bad_examples:
  - "Overdue items shown only in red text."
  - "A chart whose series are distinguishable only by hue."
review_check: >-
  If this screen were rendered in grayscale, would every state, error, and
  distinction still be identifiable?
related: [COLOR-001, STATE-005, A11Y-006, FORM-007]
sources:
  - title: Apple HIG — Color
    url: https://developer.apple.com/design/human-interface-guidelines/color
    tier: A
    note: Never use color as the only means to differentiate objects or communicate essential information.
  - title: Android Developers — Accessibility principles
    url: https://developer.android.com/guide/topics/ui/accessibility/principles
    tier: A
  - title: WCAG 2.2 — 3.3.1 Error Identification
    url: https://www.w3.org/TR/WCAG22/
    tier: A
    note: Errors must be described in text, not signaled only by color or border.
last_verified: 2026-08-08
```

```yaml
id: COLOR-004
title: Support both light and dark appearance
area: layout
subcategory: appearance
severity: medium
stability: current
platforms: [ios, android]
rule: >-
  Every color used in the app MUST have a defined light and dark variant, and all
  screens MUST be verified in both appearances; hard-coded light-only colors MUST
  NOT be used for surfaces or text.
rationale: >-
  Users switch appearance system-wide; a screen designed only for light mode
  produces unreadable text and invisible boundaries in dark mode.
values:
  ios: supply light and dark variants (plus an increased-contrast option) even in single-appearance apps, because the current design language adapts materials to underlying content
applies_to:
  - surfaces and backgrounds
  - text and icon colors
  - illustrations and empty-state artwork
  - status and semantic colors
exceptions:
  - Brand-critical assets whose color is fixed, provided contrast is met in both appearances.
good_examples:
  - "Using semantic system colors that resolve per appearance."
bad_examples:
  - "A card hard-coded to #FFFFFF with #222222 text, unreadable in dark mode surfaces."
review_check: >-
  Has every screen been checked in dark appearance, with all text and boundaries
  still meeting their contrast requirements?
related: [COLOR-001, COLOR-005, IOS-003]
sources:
  - title: Apple HIG — Color
    url: https://developer.apple.com/design/human-interface-guidelines/color
    tier: A
    note: All colors must work in light, dark, and Increase Contrast contexts.
last_verified: 2026-08-08
```

```yaml
id: COLOR-005
title: Use semantic system colors instead of hard-coded values
area: layout
subcategory: color-semantics
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  Colors SHOULD come from the platform's semantic color roles used for their
  intended purpose; documented system color values MUST NOT be hard-coded, and a
  single color MUST NOT be used for both interactive and non-interactive elements.
rationale: >-
  Hard-coded values drift from the OS across releases and break in alternative
  appearances, and reusing the interactive color for static elements teaches
  users to tap things that do nothing.
applies_to:
  - text, separators, and backgrounds
  - accent and tint colors
  - status colors (success, warning, error)
exceptions:
  - A deliberate brand palette defined as tokens with light/dark variants and
    verified contrast.
good_examples:
  - "Using the system label / secondary label / separator roles for their stated purposes."
bad_examples:
  - "Copying the current RGB value of a system gray into the stylesheet."
  - "Rendering non-tappable headings in the app's accent color."
review_check: >-
  Are colors referenced through semantic roles or defined tokens rather than
  hard-coded system values, and is the interactive color reserved for interactive elements?
related: [COLOR-004, FOUND-006]
sources:
  - title: Apple HIG — Color
    url: https://developer.apple.com/design/human-interface-guidelines/color
    tier: A
    note: Don't hard-code documented color values; don't repurpose semantic colors.
  - title: Material Design 3 — Usability overview (dynamic color roles)
    url: https://m3.material.io/foundations/usability/overview
    tier: A
  - title: デジタル庁デザインシステム — Color
    url: https://design.digital.go.jp/dads/foundations/color/
    tier: B
    note: Semantic colors — success green, error red, warning yellow/orange.
last_verified: 2026-08-08
```
