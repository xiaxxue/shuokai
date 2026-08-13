# Reachability

片手操作時の到達しやすさと、主要操作の垂直位置。

**一次情報に数値規定は存在しない。** Apple・Google のいずれも「サムゾーン」の座標や比率を公表していないことを調査で確認した（`sources/research-notes/gestures-haptics-reach.md`）。したがって本領域のルールは severity を抑え、Tier B（NN/g、UXmatters）を根拠として「上端に主要操作を置かない」という方向性のみを規定する。**特定の比率や「最下端が最適」といった規範は書かない** — NN/g は画面中央が最も押しやすいとしており、最下端が最適という通説とは一致しない。

```yaml
id: REACH-001
title: Keep primary actions out of the top of the screen
area: layout
subcategory: reachability
severity: low
stability: core
platforms: [ios, android]
rule: >-
  Frequently used primary actions SHOULD be placed in the middle-to-lower portion
  of the screen rather than along the top edge, which is the hardest area to reach
  one-handed on a large phone.
rationale: >-
  Most phone use is one-handed or cradled, and reaching the top edge of a large
  device requires either shifting grip or using the second hand — a cost paid on
  every use of a frequent action.
values:
  official: neither Apple nor Google publishes thumb-zone coordinates or ratios — no numeric threshold is defined here
  tier_b: observational studies report roughly half of phone use is one-handed; usability research finds the middle of the screen easiest to reach, not the very bottom edge
applies_to:
  - primary call to action
  - high-frequency controls
  - confirmation buttons in long forms
exceptions:
  - Platform-standard positions, which win over this rule (e.g. a trailing-edge
    toolbar action on iOS, where the convention is stronger than the ergonomics).
  - Destructive actions, which benefit from being harder to reach.
good_examples:
  - "A floating action button or bottom action bar for the app's main create action."
bad_examples:
  - "Placing the only Save action in the top-leading corner of a long form."
review_check: >-
  Is each frequently used primary action positioned in the middle or lower part
  of the screen rather than at the top edge, unless a platform convention places
  it there?
related: [BTN-002, TOUCH-003, ADAPT-008]
sources:
  - title: NN/g — Touch Targets on Touchscreens
    url: https://www.nngroup.com/articles/touch-target-size/
    tier: B
  - title: UXmatters — How Do Users Really Hold Mobile Devices?
    url: https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
    tier: B
    note: Observational study, n=1,333; roughly half of use one-handed. Age of the study limits how far it generalizes to current device sizes.
last_verified: 2026-08-11
```

```yaml
id: REACH-002
title: Do not assume a single grip or hand
area: layout
subcategory: reachability
severity: suggestion
stability: core
platforms: [ios, android]
rule: >-
  Layouts SHOULD NOT assume a specific hand or grip; controls placed on one side
  SHOULD have their mirror-side equivalent reachable, and no action SHOULD require
  a two-handed grip unless the task inherently does.
rationale: >-
  Grip varies by user, by hand, by whether the other hand is occupied, and by
  writing direction; a layout tuned for a right-handed one-handed grip is
  uncomfortable for a substantial share of use.
applies_to:
  - side-anchored controls
  - swipe direction affordances
  - reachability of destructive versus primary actions
exceptions:
  - Tasks that inherently need both hands, such as text entry on a tablet.
good_examples:
  - "Row actions available from both swipe directions, or from a menu reachable regardless of grip."
bad_examples:
  - "A control docked to the trailing edge as the only path, in an app whose primary market reads right-to-left."
review_check: >-
  Can every frequent action be performed with either hand, without requiring a
  specific grip?
related: [REACH-001, LIST-003, A11Y-005]
sources:
  - title: UXmatters — How Do Users Really Hold Mobile Devices?
    url: https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php
    tier: B
last_verified: 2026-08-11
```
