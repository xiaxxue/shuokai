# Lists and Cards

リストとカードの選択・構成のルール。空リストの扱いは `rules/states/ui-states.md`（STATE-004）が正本。

```yaml
id: LIST-001
title: Do not wrap every item in a card
area: components
subcategory: container-choice
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  A card SHOULD be used only when its content is a self-contained unit with its
  own actions or when items must be visually separated from differing content
  around them; homogeneous sequences of items SHOULD use plain list rows.
rationale: >-
  Cards add padding, elevation, and borders per item, which reduces the number of
  items visible on a small screen and flattens hierarchy — everything looks
  equally important and scanning gets slower.
applies_to:
  - collections of homogeneous items
  - feeds and search results
  - settings and menu screens
exceptions:
  - Mixed-content dashboards where each card is a distinct module.
  - Items carrying rich media and multiple independent actions.
good_examples:
  - "A book list rendered as list rows with a thumbnail, title, and author."
bad_examples:
  - "Each of 40 to-do items rendered as an elevated card with 16dp padding."
review_check: >-
  For each card in this design, does its content form a self-contained unit with
  its own actions, rather than being one of many homogeneous list items?
related: [FOUND-005, LIST-002]
sources:
  - title: Material Design 3 — Lists guidelines
    url: https://m3.material.io/components/lists/guidelines
    tier: A
    note: Lists are the standard container for continuous, homogeneous content.
  - title: NN/g — 10 Usability Heuristics (#8 Aesthetic and minimalist design)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: LIST-002
title: Keep list rows scannable
area: components
subcategory: content
severity: low
stability: convention
platforms: [ios, android]
rule: >-
  List rows SHOULD lead with the attribute users scan by, SHOULD limit supporting
  text, and SHOULD align leading elements consistently so the column can be
  scanned vertically.
values:
  material: limit list item supporting text to one to three lines; ideal line length 40–60 characters
applies_to:
  - list and collection rows
  - search results
exceptions:
  - Preview-style rows (e.g. message inboxes) where a longer snippet is the
    primary value of the row.
rationale: >-
  Users scan lists by a single distinguishing attribute; burying it after
  secondary metadata or varying the leading element defeats vertical scanning.
good_examples:
  - "Rows starting with the book title, with author and date as one line of supporting text."
bad_examples:
  - "Rows starting with a registration timestamp, with the title on the third line."
review_check: >-
  Does each row lead with the attribute users search by and keep supporting text
  to at most three lines, with leading elements aligned?
related: [LIST-001, TYPE-005]
sources:
  - title: Material Design 3 — Lists guidelines
    url: https://m3.material.io/components/lists/guidelines
    tier: A
last_verified: 2026-08-08
```

```yaml
id: LIST-003
title: Row actions must be reachable without gestures
area: components
subcategory: actions
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Actions attached to a list row (delete, archive, favorite) MUST be available
  through a visible control or a standard menu, and a swipe gesture MUST NOT be
  the only way to reach them.
rationale: >-
  Hidden swipe actions are undiscoverable, and users who cannot perform path-based
  gestures lose access to the functionality entirely.
values:
  wcag: 2.5.1 Pointer Gestures (A) — path-based gestures need a single-pointer alternative
  material: interactive elements inside list items must have a target size of at least 48x48dp
applies_to:
  - swipe-to-delete and swipe-to-archive
  - drag-to-reorder
  - long-press menus
exceptions:
  - Gestures that are pure accelerators duplicating a visible control.
good_examples:
  - "Swipe-to-delete plus a Delete entry in the row's overflow menu and in the detail screen."
bad_examples:
  - "Reordering available only by long-press-and-drag, with no move up/down alternative."
review_check: >-
  Is every row action also reachable through a visible control or menu, with a
  hit area of at least 44pt/48dp?
related: [TOUCH-001, A11Y-002, DESTR-001]
sources:
  - title: WCAG 2.2 — 2.5.1 Pointer Gestures
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: Apple HIG — Gestures
    url: https://developer.apple.com/design/human-interface-guidelines/gestures
    tier: A
    note: Never make a gesture the only way to perform an important action.
  - title: Material Design 3 — Lists specs
    url: https://m3.material.io/components/lists/specs
    tier: A
last_verified: 2026-08-08
```
