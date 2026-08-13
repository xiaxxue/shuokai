# Android Platform Conventions

Android 固有の慣習。両OS共通の規範は各トピック領域が正本であり、ここには **Android にしか存在しない機構・慣習** のみを置く。

現行OSに関する注記: Android 15（SDK 35）で edge-to-edge が強制され、Android 16（SDK 36）ではオプトアウト属性が無効化された。また targetSdk 36 では予測型戻るジェスチャーが既定で有効になり、`onBackPressed()` は呼ばれず `KEYCODE_BACK` も配送されない。これらは `stability: current` として扱い、OSアップデートごとに再確認する。

```yaml
id: AND-001
title: Support the predictive back gesture
area: platform
subcategory: back-navigation
severity: high
stability: current
platforms: [android]
rule: >-
  Back handling MUST use the platform's current back APIs (OnBackPressedDispatcher
  / OnBackInvokedCallback) so predictive back animations work; overriding
  onBackPressed() or intercepting the back key MUST NOT be used, and the app MUST
  NOT permanently opt out of predictive back.
rationale: >-
  On apps targeting SDK 36 the legacy callbacks are no longer invoked, so back
  handling written against them silently stops working — losing unsaved-changes
  prompts and custom back behavior — while users see a system animation promising
  a navigation that the app does not perform.
values:
  android: predictive back is enabled by default for apps targeting SDK 36 on Android 16+; enableOnBackInvokedCallback="false" is a temporary opt-out only
applies_to:
  - back handling on any screen
  - unsaved-changes interception
  - custom navigation stacks
  - WebView-based flows
exceptions:
  - Temporary opt-out during a migration, tracked as technical debt.
good_examples:
  - "Registering an OnBackPressedCallback that shows the discard-changes dialog while remaining enabled only while the form is dirty."
bad_examples:
  - "Overriding onBackPressed() to show a confirmation dialog."
review_check: >-
  Is all back handling implemented with OnBackPressedDispatcher /
  OnBackInvokedCallback rather than onBackPressed() or key interception?
related: [NAV-008, NAV-010]
sources:
  - title: Android Developers — Predictive back gesture
    url: https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture
    tier: A
  - title: Android 16 behavior changes
    url: https://developer.android.com/about/versions/16/behavior-changes-16
    tier: A
    note: onBackPressed is not called and KEYCODE_BACK is not dispatched for apps targeting SDK 36.
last_verified: 2026-08-08
```

```yaml
id: AND-002
title: Handle window insets under enforced edge-to-edge
area: platform
subcategory: layout
severity: high
stability: current
platforms: [android]
rule: >-
  Apps MUST handle window insets explicitly (system bars, display cutout, IME,
  and system gesture insets) because current Android versions display apps
  edge-to-edge with no opt-out available.
rationale: >-
  Without inset handling, content and controls render underneath the status bar
  and gesture navigation area, making them unreadable or untappable — and on
  SDK 36 there is no attribute left to disable the behavior.
values:
  android: SDK 35 on Android 15+ enforces edge-to-edge (opt-out possible); for SDK 36 windowOptOutEdgeToEdgeEnforcement is deprecated and disabled
applies_to:
  - top-level screen scaffolds
  - bottom bars, FABs, and sticky footers
  - full-screen media
  - scrollable content padding
exceptions:
  - Decorative backgrounds intended to extend beneath system bars.
good_examples:
  - "Applying systemBars and IME insets as padding on the content container while the background extends edge-to-edge."
bad_examples:
  - "A bottom action bar whose buttons sit behind the gesture navigation handle."
review_check: >-
  Does every screen apply system bar, cutout, and IME insets so no interactive
  control or essential text is covered?
related: [SPACE-001, SPACE-002]
sources:
  - title: Android Developers — Display content edge-to-edge
    url: https://developer.android.com/develop/ui/views/layout/edge-to-edge
    tier: A
  - title: Android 16 behavior changes
    url: https://developer.android.com/about/versions/16/behavior-changes-16
    tier: A
last_verified: 2026-08-08
```

```yaml
id: AND-003
title: Use Material components and Android navigation structures
area: platform
subcategory: conventions
severity: medium
stability: convention
platforms: [android]
rule: >-
  Android apps SHOULD use Material components and Android navigation structures,
  and MUST NOT transplant another platform's navigation chrome (e.g. an iOS-style
  trailing back control or a bottom bar used for actions rather than destinations).
rationale: >-
  Material components carry the platform's touch targets, contrast roles, and
  accessibility semantics by default, and users apply Android-wide expectations
  to where navigation and actions live.
values:
  android: navigation bar for 3–5 destinations at compact/medium breakpoints; navigation rail at expanded and larger
applies_to:
  - navigation structure
  - controls, pickers, and dialogs
  - action placement
exceptions:
  - Deliberate brand or cross-platform design systems that still meet touch
    target, contrast, and back-navigation rules.
good_examples:
  - "A bottom navigation bar with four destinations plus a FAB for the primary create action."
bad_examples:
  - "An iOS-style segmented tab bar with a back chevron on the trailing edge."
review_check: >-
  Does the Android design use Material components and Android navigation
  structures rather than another platform's patterns?
related: [NAV-002, IOS-001]
sources:
  - title: Material Design 3 — Navigation bar guidelines
    url: https://m3.material.io/components/navigation-bar/guidelines
    tier: A
  - title: Material Design 3 — Navigation rail guidelines
    url: https://m3.material.io/components/navigation-rail/guidelines
    tier: A
last_verified: 2026-08-08
```

```yaml
id: AND-004
title: System back must never be destructive
area: platform
subcategory: back-navigation
severity: high
stability: core
platforms: [android]
rule: >-
  Pressing system back MUST NOT discard user data silently, MUST NOT exit the app
  from a nested screen, and MUST NOT be repurposed to perform an action other
  than navigating back.
rationale: >-
  System back is used reflexively and constantly on Android; if it destroys work
  or drops the user out of the app, the damage happens before the user can react.
applies_to:
  - forms and editors with unsaved input
  - multi-step flows
  - nested navigation stacks
  - modal and full-screen dialogs
exceptions:
  - The root screen of the app, where back exits by design.
good_examples:
  - "Back on a dirty form shows a discard-changes confirmation and keeps the input if cancelled."
bad_examples:
  - "Back from step 3 of a form exiting the app and clearing all entered data."
review_check: >-
  For each screen, does system back navigate to the expected previous
  destination without discarding unsaved input or exiting the app unexpectedly?
related: [AND-001, NAV-008, NAV-010, FORM-006]
sources:
  - title: Android Developers — Predictive back gesture
    url: https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture
    tier: A
  - title: NN/g — 10 Usability Heuristics (#3 User control and freedom)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```
