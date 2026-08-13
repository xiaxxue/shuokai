# Haptics

触覚フィードバックの設計。

一次情報の注記: 「ハプティクス単独で情報を伝えない」という規範は、Apple の「ハプティクスはオプションとして扱う」「フィードバックは複数チャネルで」という記述からの**導出**であり、Android 側に同一の主張は確認できていない。導出であることを明示したうえで規範化している。

```yaml
id: HAPT-001
title: Haptics must not carry information on their own
area: interaction
subcategory: feedback
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Haptic feedback MUST accompany a visual or textual indication rather than being
  the sole channel for any state, confirmation, or error.
rationale: >-
  Haptics are unavailable when the device is in a pocket or on a table, are
  disabled by a system setting many users turn off, and convey nothing to users
  who cannot feel them — so information carried only by vibration is simply lost.
values:
  derivation: Apple states haptics should be treated as optional and that feedback should be delivered through multiple channels; no equivalent statement was found in Android's documentation, so this rule is derived rather than quoted
applies_to:
  - success and failure confirmation
  - selection and toggle changes
  - threshold and boundary feedback
exceptions:
  - Haptics reinforcing information already presented visually, which is the
    intended use.
good_examples:
  - "A scan success shown as a card sliding in, with a light haptic alongside it."
bad_examples:
  - "Signalling a failed scan only with a vibration."
review_check: >-
  Is every haptic in this design paired with a visible indication of the same
  information?
related: [A11Y-006, FOUND-002, HAPT-002]
sources:
  - title: Apple HIG — Playing haptics
    url: https://developer.apple.com/design/human-interface-guidelines/playing-haptics
    tier: A
  - title: Apple HIG — Feedback
    url: https://developer.apple.com/design/human-interface-guidelines/feedback
    tier: A
    note: Provide feedback through multiple channels so it stays accessible.
last_verified: 2026-08-11
```

```yaml
id: HAPT-002
title: Use the platform's semantic haptic constants
area: interaction
subcategory: implementation
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  Haptics SHOULD be produced through the platform's named semantic feedback types
  matched to their documented meaning, and raw duration-based vibration SHOULD NOT
  be used to hand-author effects.
rationale: >-
  Semantic constants are tuned per device actuator and stay consistent with the
  rest of the system, while hand-authored vibration produces a different, usually
  worse, sensation on every device and drifts from platform conventions.
values:
  ios: distinct notification (success / warning / failure), impact, and selection feedback types, each with a documented meaning
  android: named feedback constants including confirm and reject, toggle on/off, segment tick, and gesture threshold — map success to confirm and failure to reject
applies_to:
  - confirmation and error feedback
  - selection changes and pickers
  - drag thresholds and snapping
exceptions:
  - Media and game experiences designing a bespoke haptic vocabulary.
good_examples:
  - "Using the platform's failure notification haptic when a payment is declined."
bad_examples:
  - "Calling a raw vibrate with a hand-picked millisecond duration for a form error."
review_check: >-
  Does each haptic use a named platform feedback type whose documented meaning
  matches the event, rather than a hand-authored duration?
related: [HAPT-001, HAPT-003]
sources:
  - title: Apple HIG — Playing haptics
    url: https://developer.apple.com/design/human-interface-guidelines/playing-haptics
    tier: A
  - title: Android Developers — HapticFeedbackConstants
    url: https://developer.android.com/reference/android/view/HapticFeedbackConstants
    tier: A
last_verified: 2026-08-11
```

```yaml
id: HAPT-003
title: Use haptics sparingly and never override the user's setting
area: interaction
subcategory: restraint
severity: medium
stability: current
platforms: [ios, android]
rule: >-
  Haptics MUST respect the user's system haptic setting and MUST NOT be forced on;
  they SHOULD be reserved for meaningful moments rather than attached to every
  interaction, and high-frequency events SHOULD use the weakest effect or none.
rationale: >-
  Constant vibration desensitizes the user until the haptic that matters is
  ignored, drains battery, and overriding the system setting removes a control the
  user deliberately turned off.
values:
  android: the flag that ignored the global haptic setting is deprecated as of API 33; only privileged apps can bypass the user's setting
  guidance: less is more — attach haptics to consequential moments, not to every tap
applies_to:
  - scrolling and list interactions
  - typing and keyboards
  - repeated stepper and slider changes
exceptions:
  - Keyboards and pickers, where per-item feedback is the platform convention and
    still follows the user's setting.
good_examples:
  - "A haptic when a drag snaps into place, and none while it is being dragged."
bad_examples:
  - "A haptic on every row tap in a list."
  - "Forcing vibration even when the user disabled system haptics."
review_check: >-
  Does the design follow the system haptic setting, and is each haptic tied to a
  consequential moment rather than to routine interactions?
related: [HAPT-001, HAPT-004, A11Y-008]
sources:
  - title: Android Developers — HapticFeedbackConstants
    url: https://developer.android.com/reference/android/view/HapticFeedbackConstants
    tier: A
    note: FLAG_IGNORE_GLOBAL_SETTING is deprecated from API 33; only privileged apps may bypass the user setting.
  - title: Apple HIG — Playing haptics
    url: https://developer.apple.com/design/human-interface-guidelines/playing-haptics
    tier: A
    note: Avoid overusing haptics; make them optional.
last_verified: 2026-08-11
```

```yaml
id: HAPT-004
title: Omit haptics that the device cannot render cleanly
area: interaction
subcategory: quality
severity: low
stability: convention
platforms: [android]
rule: >-
  A haptic effect SHOULD be omitted rather than played when the device's actuator
  can only produce a long, buzzy sensation, because an imprecise haptic degrades
  the experience more than silence does.
rationale: >-
  Low-quality actuators keep ringing after the signal ends, turning what should be
  a crisp tick into a buzz that reads as a malfunction.
values:
  android: a good key-click haptic signal is roughly 10–20 ms; weaker actuators leave 20–50 ms of residual vibration, which is what makes the effect feel buzzy
applies_to:
  - keyboard and tick feedback
  - fine-grained interaction feedback
exceptions:
  - Alert-level haptics where being noticed matters more than precision.
good_examples:
  - "Checking the device's haptic capability and skipping tick feedback where it cannot be rendered crisply."
bad_examples:
  - "Playing a long buzz on every keypress on a low-end device."
review_check: >-
  Does the design account for devices that cannot render crisp haptics by
  omitting the effect rather than playing a degraded one?
related: [HAPT-002, HAPT-003]
sources:
  - title: Android Developers — Haptics design principles
    url: https://developer.android.com/develop/ui/views/haptics/haptics-principles
    tier: A
last_verified: 2026-08-11
```
