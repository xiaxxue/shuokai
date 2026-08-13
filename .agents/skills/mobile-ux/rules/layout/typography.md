# Typography

文字サイズ・拡大対応・可読性のルール。ユーザーのOS文字サイズ設定への追従（TYPE-001）がこの領域の中心で、`rules/accessibility/` からはこれを参照する。

Material 3 の type scale のうち Body/Label の sp 値は現行の一次情報から数値を確認できていないため、本ルール集では数値を規定しない（`sources/research-notes/android-material.md` 参照）。

```yaml
id: TYPE-001
title: Respect the user's system text size setting
area: layout
subcategory: dynamic-type
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Text MUST use the platform's scalable text mechanism (iOS Dynamic Type text
  styles, Android sp units) and layouts MUST remain usable — no clipped,
  overlapped, or unreachable content or controls — when the user enlarges text.
rationale: >-
  Enlarged text is the most commonly used accessibility setting; layouts built on
  fixed point sizes and fixed-height containers silently break for those users.
values:
  ios: support Dynamic Type through the accessibility sizes AX1–AX5 (Body scales from 17 pt default up to 53 pt); enable at least 200% enlargement
  android: specify font sizes in sp so they follow the user's font scale
  wcag: 1.4.4 Resize Text — up to 200% without loss of content or functionality (AA)
applies_to:
  - all text
  - containers with fixed heights
  - buttons and labels
  - list rows and cards
exceptions:
  - Images of text such as logos, and captions rendered inside video.
good_examples:
  - "A list row whose height grows with text and stacks its secondary label at accessibility sizes."
bad_examples:
  - "A 44dp fixed-height row whose label truncates to one character at large font scales."
  - "Hard-coded 14sp text that ignores the system font scale."
review_check: >-
  At 200% text size, does every screen still show all content and keep all
  controls reachable, without clipping or overlap?
related: [TYPE-002, TYPE-004, A11Y-004]
sources:
  - title: Apple HIG — Typography (Dynamic Type)
    url: https://developer.apple.com/design/human-interface-guidelines/typography
    tier: A
  - title: Apple HIG — Accessibility (text enlargement)
    url: https://developer.apple.com/design/human-interface-guidelines/accessibility
    tier: A
    note: Ideally allow at least 200% enlargement (140% on watchOS).
  - title: Android Developers — Accessibility foundations
    url: https://developer.android.com/design/ui/mobile/guides/foundations/accessibility
    tier: A
  - title: WCAG 2.2 — 1.4.4 Resize Text
    url: https://www.w3.org/TR/WCAG22/
    tier: A
last_verified: 2026-08-08
```

```yaml
id: TYPE-002
title: Body text meets the platform minimum size
area: layout
subcategory: text-size
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  Body text SHOULD use the platform default size and MUST NOT fall below the
  platform minimum at the default text-size setting.
values:
  ios: default body 17 pt; absolute minimum 11 pt
  android: body must not be smaller than 12sp
  ja: Japanese public-sector guidance (DADS) sets body minimum 16px, with 14px only in constrained areas and below 14px not permitted
applies_to:
  - body copy
  - list item primary and supporting text
  - form labels and helper text
exceptions:
  - Legally required fine print, which still must meet contrast and be zoomable.
rationale: >-
  Text below the platform minimum is unreadable for a large share of users even
  before any vision impairment is considered.
good_examples:
  - "17pt body text on iOS, 16sp body text on Android."
bad_examples:
  - "10sp captions used for meaningful metadata in a list."
review_check: >-
  Is every text style in this design at or above the platform minimum size at
  the default text-size setting?
related: [TYPE-001, TYPE-003]
sources:
  - title: Apple HIG — Typography (platform default and minimum sizes)
    url: https://developer.apple.com/design/human-interface-guidelines/typography
    tier: A
  - title: Android Developers — Accessibility foundations
    url: https://developer.android.com/design/ui/mobile/guides/foundations/accessibility
    tier: A
    note: Don't make the body size any smaller than 12sp.
  - title: デジタル庁デザインシステム — Typography
    url: https://design.digital.go.jp/dads/foundations/typography/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: TYPE-003
title: Avoid thin weights and excessive typeface variety
area: layout
subcategory: legibility
severity: low
stability: convention
platforms: [ios, android]
rule: >-
  Text SHOULD use Regular weight or heavier and SHOULD limit the number of
  typefaces; Ultralight, Thin, and Light weights SHOULD NOT be used for content text.
rationale: >-
  Thin strokes lose contrast against the background at small sizes and in bright
  ambient light, and multiple typefaces weaken the perceived hierarchy.
applies_to:
  - body and label text
  - headings
exceptions:
  - Large display text where the weight is a deliberate brand treatment and
    contrast requirements are still met.
good_examples:
  - "One typeface with Regular / Semibold / Bold used consistently for hierarchy."
bad_examples:
  - "12sp Light gray captions used for form helper text."
review_check: >-
  Is all content text set in Regular weight or heavier, using at most two typefaces?
related: [TYPE-002, COLOR-001]
sources:
  - title: Apple HIG — Typography
    url: https://developer.apple.com/design/human-interface-guidelines/typography
    tier: A
    note: Avoid light font weights; minimize the number of typefaces.
last_verified: 2026-08-08
```

```yaml
id: TYPE-004
title: Keep hierarchy and truncation sane at large text sizes
area: layout
subcategory: dynamic-type
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  When text scales up, the relative order of the typographic hierarchy MUST be
  preserved, truncation SHOULD be minimized, and layouts SHOULD switch to stacked
  or single-column arrangements rather than truncating primary content.
rationale: >-
  If headings and body converge or invert at accessibility sizes, users lose the
  structural cues they rely on to scan; truncated primary content becomes unusable.
values:
  android: button labels should still fit within two lines at 200% text size, otherwise provide one-tap access to the full content
applies_to:
  - multi-column rows
  - buttons and chips
  - navigation titles
  - cards with fixed aspect ratios
exceptions:
  - Non-essential decorative labels where truncation loses no information.
good_examples:
  - "A two-column metadata row that stacks vertically at accessibility text sizes."
bad_examples:
  - "A card title truncated to '2026年の…' at the default accessibility size."
review_check: >-
  At accessibility text sizes, does primary content stay fully readable (stacked
  rather than truncated) and do headings remain visually larger than body text?
related: [TYPE-001, SPACE-003]
sources:
  - title: Apple HIG — Typography (larger accessibility sizes)
    url: https://developer.apple.com/design/human-interface-guidelines/typography
    tier: A
  - title: Material Design 3 — Buttons accessibility
    url: https://m3.material.io/components/buttons/accessibility
    tier: A
last_verified: 2026-08-08
```

```yaml
id: TYPE-005
title: Keep line length and line spacing readable
area: layout
subcategory: readability
severity: low
stability: core
platforms: [ios, android]
rule: >-
  Continuous text SHOULD keep line length within a comfortable range and MUST NOT
  break or overlap when the user increases text spacing.
values:
  material: ideal line length 40–60 characters (up to 120 on large screens, with increased line height)
  wcag: 1.4.12 Text Spacing — no loss of content at line height 1.5x, paragraph spacing 2x, letter spacing 0.12x, word spacing 0.16x (AA)
  ja: DADS body line-height 150–175%, dense UI 120–130%
applies_to:
  - paragraphs and descriptions
  - list supporting text
  - empty state and error copy
exceptions:
  - Single-line labels and numeric displays.
rationale: >-
  Overly long lines cause users to lose their place when returning to the left
  edge, and fixed-height containers that assume tight spacing clip text when the
  user overrides it.
good_examples:
  - "Description text constrained to about 50 characters per line with 1.5 line height."
bad_examples:
  - "A full-bleed paragraph on a tablet running 140 characters per line."
review_check: >-
  Does continuous text stay within roughly 40–60 characters per line and remain
  fully visible when line height is increased to 1.5x?
related: [TYPE-001, LIST-002]
sources:
  - title: Material Design 3 — Lists guidelines (line length)
    url: https://m3.material.io/components/lists/guidelines
    tier: A
  - title: WCAG 2.2 — 1.4.12 Text Spacing
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: デジタル庁デザインシステム — Typography
    url: https://design.digital.go.jp/dads/foundations/typography/
    tier: B
last_verified: 2026-08-08
```
