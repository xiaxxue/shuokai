# Accessibility

支援技術・知覚・運動能力に関わるルール。数値を伴う規定の正本は他領域にある:
タッチターゲット → `rules/layout/touch-targets.md`（TOUCH-001）、コントラスト → `rules/layout/color-and-contrast.md`（COLOR-001, COLOR-002, COLOR-003）、文字拡大 → `rules/layout/typography.md`（TYPE-001）。
ここではそれらを `related` で参照し、支援技術・入力代替・モーションなど固有の規範を定義する。

```yaml
id: A11Y-001
title: Every interactive element has an accessible name
area: accessibility
subcategory: screen-reader
severity: critical
stability: core
platforms: [ios, android]
rule: >-
  Every interactive element MUST expose an accessible name describing its purpose,
  and its role and state MUST be programmatically determinable; icon-only controls
  MUST NOT be left unlabeled.
rationale: >-
  Without a name, screen reader users hear only "button" and cannot determine what
  the control does, which makes the feature unusable rather than merely awkward.
values:
  wcag: 4.1.2 Name, Role, Value (A); 1.3.1 Info and Relationships (A)
  android: describe purpose via contentDescription; do not append the role ("Submit", not "Submit button") — use Role semantics
applies_to:
  - icon buttons
  - custom controls
  - images conveying information
  - list rows and their inline actions
  - form inputs
exceptions:
  - Purely decorative elements, which must instead be hidden from assistive
    technology rather than given a name.
good_examples:
  - "A trash icon button exposing the name '削除' with the button role."
bad_examples:
  - "A row of three unlabeled icon buttons announced as 'button, button, button'."
review_check: >-
  Does every interactive element and informative image expose a purpose-describing
  accessible name, with decorative elements hidden from assistive technology?
related: [A11Y-006, FORM-001, WRITE-008]
sources:
  - title: WCAG 2.2 — 4.1.2 Name, Role, Value
    url: https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
    tier: A
  - title: Android Developers — Make apps more accessible
    url: https://developer.android.com/guide/topics/ui/accessibility/apps
    tier: A
  - title: Apple HIG — Accessibility
    url: https://developer.apple.com/design/human-interface-guidelines/accessibility
    tier: A
last_verified: 2026-08-08
```

```yaml
id: A11Y-002
title: Gestures and motion always have a simple alternative
area: accessibility
subcategory: motor
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Functionality operated by a path-based or multi-point gesture, or by device
  motion, MUST also be operable through a single-tap control, and motion-triggered
  behavior MUST be disableable.
rationale: >-
  Users with tremor, limited dexterity, or a mounted device cannot perform swipes,
  drags, pinches, or shakes; if these are the only path, the feature is inaccessible.
values:
  wcag: 2.5.1 Pointer Gestures (A); 2.5.4 Motion Actuation (A)
applies_to:
  - swipe actions and drag-to-reorder
  - pinch zoom
  - shake to undo, tilt controls
  - custom multi-finger gestures
exceptions:
  - Cases where the gesture is essential to the function itself (e.g. a drawing
    canvas or signature capture).
good_examples:
  - "Pinch-to-zoom accompanied by visible zoom in/out buttons."
bad_examples:
  - "Reordering a list only via long-press-and-drag."
review_check: >-
  Does every gesture-driven or motion-driven action also have a single-tap
  control, with motion actuation disableable?
related: [LIST-003, A11Y-005, IOS-002]
sources:
  - title: WCAG 2.2 — 2.5.1 Pointer Gestures / 2.5.4 Motion Actuation
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: Apple HIG — Gestures
    url: https://developer.apple.com/design/human-interface-guidelines/gestures
    tier: A
  - title: Android Developers — Accessibility foundations
    url: https://developer.android.com/design/ui/mobile/guides/foundations/accessibility
    tier: A
last_verified: 2026-08-08
```

```yaml
id: A11Y-003
title: Focus and reading order match the visual order
area: accessibility
subcategory: focus
severity: high
stability: core
platforms: [ios, android]
rule: >-
  The order in which screen readers and keyboard focus traverse a screen MUST
  follow its meaningful visual order, and the focused element MUST remain visible
  and MUST NOT be entirely obscured by app chrome or the keyboard.
rationale: >-
  A traversal order that jumps around the screen destroys the structural
  understanding a screen reader user builds, and a focused element hidden behind
  a sticky bar cannot be acted on.
values:
  wcag: 2.4.3 Focus Order (A); 2.4.7 Focus Visible (AA); 2.4.11 Focus Not Obscured (AA)
applies_to:
  - screens with sticky headers and footers
  - modal sheets
  - forms
  - dynamically inserted content
exceptions:
  - Content the user themselves opened over the focused element (e.g. an
    intentionally expanded menu).
good_examples:
  - "Opening a sheet moves focus into it, and closing it restores focus to the trigger."
bad_examples:
  - "A sticky bottom CTA covering the focused input while typing."
review_check: >-
  Does assistive-technology and keyboard focus move through each screen in its
  visual order, staying visible and unobscured at every step?
related: [SPACE-002, A11Y-001, A11Y-007]
sources:
  - title: WCAG 2.2 — 2.4.3 Focus Order / 2.4.7 Focus Visible / 2.4.11 Focus Not Obscured
    url: https://www.w3.org/TR/WCAG22/
    tier: A
last_verified: 2026-08-08
```

```yaml
id: A11Y-004
title: Layouts survive enlarged text and increased text spacing
area: accessibility
subcategory: visual
severity: high
stability: core
platforms: [ios, android]
rule: >-
  All content and functionality MUST remain available when text is enlarged to
  200% and when the user overrides text spacing; content MUST NOT be clipped,
  overlapped, or made unreachable.
rationale: >-
  Text enlargement is the most widely used accessibility setting, and layouts
  built on fixed-height containers silently drop content for those users.
values:
  wcag: 1.4.4 Resize Text (AA); 1.4.12 Text Spacing (AA); 1.4.10 Reflow (AA)
applies_to:
  - all screens
  - fixed-height rows and cards
  - buttons and chips
  - tab and navigation labels
exceptions:
  - Images of text such as logos.
good_examples:
  - "A card that grows in height and reflows to a single column at 200% text."
bad_examples:
  - "A fixed 48dp row whose second line disappears when text is enlarged."
review_check: >-
  At 200% text size and with increased text spacing, is all content still visible
  and every control still reachable on every screen?
related: [TYPE-001, TYPE-004, SPACE-003]
sources:
  - title: WCAG 2.2 — 1.4.4 Resize Text / 1.4.12 Text Spacing / 1.4.10 Reflow
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: Apple HIG — Accessibility
    url: https://developer.apple.com/design/human-interface-guidelines/accessibility
    tier: A
last_verified: 2026-08-08
```

```yaml
id: A11Y-005
title: Prefer the simplest interaction for frequent actions
area: accessibility
subcategory: motor
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Frequently performed actions SHOULD require the simplest possible interaction —
  a single tap — and SHOULD NOT require precise timing, sustained pressure, or
  multi-finger coordination.
rationale: >-
  Long presses, double taps, and multi-finger gestures are difficult or impossible
  for users with limited dexterity and are undiscoverable for everyone else.
applies_to:
  - primary actions
  - high-frequency list operations
  - custom gesture shortcuts
exceptions:
  - Deliberate friction on destructive actions, where a slightly harder
    interaction is a safety feature (see DESTR-002).
good_examples:
  - "Marking a task complete with a single tap on a checkbox."
bad_examples:
  - "Requiring a long press to open the only menu on a screen."
review_check: >-
  Can every frequent action be performed with a single tap, without timing-based
  or multi-finger input?
related: [A11Y-002, TOUCH-003]
sources:
  - title: Apple HIG — Accessibility
    url: https://developer.apple.com/design/human-interface-guidelines/accessibility
    tier: A
    note: Prefer the simplest gesture possible for frequent interactions; avoid custom multifinger gestures.
  - title: WCAG 2.2 — 2.5.1 Pointer Gestures
    url: https://www.w3.org/TR/WCAG22/
    tier: A
last_verified: 2026-08-08
```

```yaml
id: A11Y-006
title: Communicate state through more than one channel
area: accessibility
subcategory: perception
severity: high
stability: core
platforms: [ios, android]
rule: >-
  State and feedback MUST be perceivable through at least two channels — for
  example text plus color, or icon plus label — and MUST NOT depend solely on
  color, sound, or haptics.
rationale: >-
  Any single channel is unavailable to some users or in some contexts (color
  blindness, muted device, grayscale mode), so single-channel signaling loses the
  information entirely for them.
applies_to:
  - selection and active states
  - validation results
  - status indicators
  - notifications and alerts
exceptions:
  - Redundant reinforcement of information already conveyed in text.
good_examples:
  - "A selected tab shown by a filled icon, a label weight change, and an indicator."
bad_examples:
  - "Success communicated only by a haptic tap."
review_check: >-
  Is every state and every piece of feedback perceivable through at least two
  independent channels?
related: [COLOR-003, COLOR-002, FOUND-002]
sources:
  - title: Apple HIG — Feedback
    url: https://developer.apple.com/design/human-interface-guidelines/feedback
    tier: A
    note: Provide feedback through multiple channels so it stays accessible.
  - title: Android Developers — Accessibility principles
    url: https://developer.android.com/guide/topics/ui/accessibility/principles
    tier: A
last_verified: 2026-08-08
```

```yaml
id: A11Y-007
title: Announce dynamic changes to assistive technology
area: accessibility
subcategory: screen-reader
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  When content changes without navigation — validation results, loaded results,
  transient messages, progress completion — the change MUST be announced to
  assistive technology rather than only rendered visually.
rationale: >-
  A screen reader user who receives no announcement has no way to know the screen
  changed, and will continue acting on stale information.
values:
  wcag: 4.1.2 Name, Role, Value (A) — change notifications must be available to assistive technologies
applies_to:
  - inline validation
  - search results updating in place
  - transient success and error messages
  - background sync completion
exceptions:
  - Purely decorative animation carrying no information.
good_examples:
  - "Announcing '3件見つかりました' when filtered results update."
bad_examples:
  - "A transient success message that appears and disappears with no announcement."
review_check: >-
  Is every in-place content change that carries meaning announced to assistive
  technology?
related: [A11Y-001, A11Y-003, STATE-007]
sources:
  - title: WCAG 2.2 — 4.1.2 Name, Role, Value
    url: https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
    tier: A
  - title: Material Design 3 — Snackbar guidelines
    url: https://m3.material.io/components/snackbar/guidelines
    tier: A
    note: Auto-dismissing messages can be missed; pair them with an inline indication or an action.
last_verified: 2026-08-08
```

```yaml
id: A11Y-008
title: Respect reduced motion and avoid time-limited UI
area: accessibility
subcategory: motion
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Non-essential animation MUST be reduced or removed when the user enables the
  system reduce-motion setting, and UI that auto-dismisses on a timer SHOULD be
  avoided or made adjustable.
rationale: >-
  Large-scale motion triggers nausea and vestibular symptoms for some users, and
  auto-dismissing content is unreadable for anyone who processes information more
  slowly or uses assistive technology.
values:
  wcag: 2.3.3 Animation from Interactions (AAA); 2.2.1 Timing Adjustable (A) — time limits must be adjustable, extendable, or off
  ios: with Reduce Motion on, tighten springs, avoid z-axis depth animation, replace positional transitions with fades
applies_to:
  - screen transitions and parallax
  - looping and autoplaying animation
  - toasts and transient messages
  - session timeouts and one-time-code windows
exceptions:
  - Animation essential to the information conveyed (e.g. a progress animation
    that indicates ongoing work).
good_examples:
  - "Cross-fading instead of sliding when reduce motion is enabled."
  - "A session-expiry warning that can be extended before timeout."
bad_examples:
  - "A parallax hero animation that plays regardless of the reduce-motion setting."
  - "An error toast that disappears after 1.5 seconds with no other record."
review_check: >-
  Does the design specify reduced-motion behavior for each animation, and can the
  user extend or avoid every time limit?
related: [A11Y-007, STATE-007]
sources:
  - title: Apple HIG — Accessibility (motion, time-boxed UI)
    url: https://developer.apple.com/design/human-interface-guidelines/accessibility
    tier: A
  - title: WCAG 2.2 — 2.3.3 Animation from Interactions / 2.2.1 Timing Adjustable
    url: https://www.w3.org/TR/WCAG22/
    tier: A
last_verified: 2026-08-08
```
