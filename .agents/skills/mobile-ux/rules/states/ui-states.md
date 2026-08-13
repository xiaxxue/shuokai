# UI States

画面状態の網羅設計。AIが最も高頻度に落とす領域であり、本 Skill の中核。
empty state の正本はここ（`rules/components/` からは参照のみ）。状態内の文言の書き方は `rules/content/ux-writing.md` が正本。

対象とする状態: `normal` / `loading` / `empty` / `error` / `offline` / `success` / `disabled` / `permission-denied`

```yaml
id: STATE-001
title: Decide every UI state explicitly for every screen
area: states
subcategory: coverage
severity: critical
stability: core
platforms: [ios, android]
rule: >-
  For each screen, the design MUST explicitly decide whether each of loading,
  empty, error, offline, success, disabled, and permission-denied can occur, and
  MUST define the resulting UI for each state that can occur. States that cannot
  occur MUST be marked as such with a reason.
rationale: >-
  Screens designed only in their populated happy-path state break the first time
  a request is slow, a list is empty, or the network drops — which is the normal
  condition on mobile, not an edge case.
applies_to:
  - every screen and major component that loads, submits, or depends on
    permissions or connectivity
exceptions:
  - Purely static informational screens with no data source, permissions, or
    actions — which must still be stated as such.
good_examples:
  - "A screen × state matrix in the design doc where each cell is either designed or marked '−: local data only, no loading'."
bad_examples:
  - "A book list screen specified only as 'shows the list of books'."
review_check: >-
  Does the design contain a screen × state matrix covering all eight states for
  every screen, with each cell either designed or explicitly excluded with a reason?
related: [STATE-002, STATE-004, STATE-005, STATE-006, STATE-009]
sources:
  - title: NN/g — 10 Usability Heuristics (#1 Visibility of system status)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: Apple HIG — Loading
    url: https://developer.apple.com/design/human-interface-guidelines/loading
    tier: A
last_verified: 2026-08-08
```

## Loading

```yaml
id: STATE-002
title: Loading states show what is loading, not a bare spinner
area: states
subcategory: loading
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  A loading state MUST indicate what is being loaded and where it will appear;
  a full-screen indeterminate spinner with no context SHOULD NOT be used when a
  skeleton, placeholder, or partial content can be shown instead.
rationale: >-
  A context-free spinner tells users only that something is happening somewhere,
  so they cannot judge whether waiting is worthwhile or whether the app is stuck.
values:
  ios: use a determinate progress indicator when the duration is known, indeterminate when it is not
applies_to:
  - initial screen load
  - pagination and infinite scroll
  - refresh
  - submission in progress
exceptions:
  - Waits short enough that any indicator would flash (typically well under a second),
    where showing nothing is preferable.
good_examples:
  - "A skeleton list showing the shape of the rows that are loading."
  - "A determinate progress bar during a file upload."
bad_examples:
  - "A centered spinner covering the whole screen for every data fetch."
review_check: >-
  Does each loading state show the structure or description of what is loading,
  rather than only an unlabeled spinner?
related: [STATE-003, FOUND-002, BTN-005]
sources:
  - title: Apple HIG — Loading
    url: https://developer.apple.com/design/human-interface-guidelines/loading
    tier: A
  - title: NN/g — 10 Usability Heuristics (#1 Visibility of system status)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: STATE-003
title: Show usable content as early as possible
area: states
subcategory: loading
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Screens SHOULD render available content, cached data, or placeholders
  immediately rather than blocking the entire view until every request completes,
  and background loading SHOULD NOT prevent the user from doing other things.
rationale: >-
  Perceived performance is driven by time-to-first-content; blocking the whole
  screen on the slowest request makes a fast app feel slow and idles the user.
applies_to:
  - screens combining multiple data sources
  - feeds and lists
  - detail screens with secondary sections
exceptions:
  - Screens where partial data would be misleading or unsafe (e.g. account balances).
good_examples:
  - "Rendering the cached list instantly and refreshing it in place when the network responds."
bad_examples:
  - "Blocking the entire home screen until an optional recommendations request finishes."
review_check: >-
  Does each screen render its primary content or placeholders without waiting for
  secondary or optional requests to complete?
related: [STATE-002, STATE-006]
sources:
  - title: Apple HIG — Loading
    url: https://developer.apple.com/design/human-interface-guidelines/loading
    tier: A
    note: Show content or placeholders as soon as possible; load in the background.
last_verified: 2026-08-08
```

## Empty

```yaml
id: STATE-004
title: Empty states explain the situation and offer the next action
area: states
subcategory: empty
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Every collection that can be empty MUST have a designed empty state for each
  distinct cause of emptiness, stating why it is empty and providing the action
  that resolves that specific cause; a blank area, an icon with no explanation,
  or one generic message covering several causes MUST NOT be used.
rationale: >-
  An empty screen with no guidance reads as a broken app, and a message written
  for the wrong cause is worse than none — telling an existing user "まだ登録
  していません" when their filter simply excluded everything sends them to the
  wrong action entirely.
values:
  causes_to_enumerate: never created / excluded by search or filter / out of scope for the current date, day, or period / no permission / not yet synced / archived or completed
applies_to:
  - first-run lists and collections
  - search and filter results
  - date-scoped and period-scoped views
  - archives and history screens
  - sections unavailable in the current context
exceptions:
  - Transient emptiness during loading, which is the loading state instead (STATE-002).
good_examples:
  - "'まだ本を登録していません' plus a '本を追加' button."
  - "'「〇〇」に一致する本はありません' plus '検索条件を変更' and '新しく追加'."
  - "A day view showing '今日が対象の習慣はありません' with a link to the full list, distinct from the zero-habits message."
bad_examples:
  - "An empty list screen showing only a gray box illustration."
  - "Zero search results rendering as a blank screen."
  - "A filtered view that shows the first-run message '追加してはじめましょう' to a user who already has 40 items."
review_check: >-
  For each screen that can show an empty collection, have you enumerated every
  cause of emptiness (never created / filtered out / out of scope for the current
  date or period / permission / not synced), and does each cause have its own
  message and its own resolving action?
related: [STATE-001, WRITE-006, NAV-007]
sources:
  - title: NN/g — 10 Usability Heuristics (#1 Visibility of system status, #10 Help and documentation)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: Apple HIG — Tab bars
    url: https://developer.apple.com/design/human-interface-guidelines/tab-bars
    tier: A
    note: Never disable a tab whose content is unavailable — show an explanation in the empty section instead.
last_verified: 2026-08-08
```

## Error / Offline

```yaml
id: STATE-005
title: Error states provide a recovery path
area: states
subcategory: error
severity: critical
stability: core
platforms: [ios, android]
rule: >-
  Every error state MUST offer at least one way forward — retry, an alternative
  route, or a way back — and MUST NOT leave the user on a screen whose only
  content is a failure message.
rationale: >-
  An error with no action is a dead end; users can only kill the app, and any
  work in progress is lost.
applies_to:
  - network and server failures
  - failed submissions
  - unavailable content
  - unexpected states
exceptions:
  - Errors displayed inline next to a field, where the correction itself is the
    recovery path (see FORM-005).
good_examples:
  - "'読み込めませんでした。通信状況を確認して、もう一度お試しください。' plus a 再試行 button and a back affordance."
bad_examples:
  - "A full-screen 'エラーが発生しました' with no button."
review_check: >-
  Does every error state present at least one actionable control (retry,
  alternative, or navigation back) in addition to the message?
related: [WRITE-002, STATE-006, NAV-001, FORM-007]
sources:
  - title: NN/g — 10 Usability Heuristics (#9 Help users recognize, diagnose, and recover from errors)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: WCAG 2.2 — 3.3.3 Error Suggestion
    url: https://www.w3.org/TR/WCAG22/
    tier: A
last_verified: 2026-08-08
```

```yaml
id: STATE-006
title: Design for offline and degraded connectivity
area: states
subcategory: offline
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Screens depending on network data MUST define their offline behavior: what
  remains available, how the offline condition is communicated, and what happens
  to actions taken while offline.
rationale: >-
  Mobile connectivity is intermittent by nature; an app that treats offline as an
  unexpected error loses user work and appears broken during ordinary use such as
  commuting.
applies_to:
  - list and detail screens backed by remote data
  - submission and sync actions
  - media playback
exceptions:
  - Features that are inherently online-only (e.g. live streaming), which must
    still explain the requirement rather than fail silently.
good_examples:
  - "Showing cached entries with an 'オフライン' indicator, queueing new entries for sync."
bad_examples:
  - "A generic 'エラーが発生しました' alert whenever the device is offline."
  - "Silently discarding a form submission made while offline."
review_check: >-
  For each network-dependent screen, is the offline behavior defined — what is
  shown, how it is labeled, and what happens to user actions?
related: [STATE-005, STATE-003, FORM-006]
sources:
  - title: NN/g — 10 Usability Heuristics (#1 Visibility of system status)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: Apple HIG — Feedback
    url: https://developer.apple.com/design/human-interface-guidelines/feedback
    tier: A
last_verified: 2026-08-08
```

## Success / Disabled / Permission-denied

```yaml
id: STATE-007
title: Confirm completion proportionally, without blocking
area: states
subcategory: success
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  Successful completion SHOULD be confirmed in place — through the resulting
  state change or a transient message — and SHOULD NOT require the user to
  dismiss a dialog; explicit confirmation SHOULD be reserved for significant,
  consequential tasks.
rationale: >-
  Users expect success and mainly need to know about failure; a modal success
  dialog adds a mandatory tap to every completion and trains dismissal reflexes.
values:
  android: only one snackbar at a time, at most one action, and a snackbar must not be the only way to reach a core use case
applies_to:
  - save, add, delete, send actions
  - purchases and submissions
exceptions:
  - Payments, submissions with legal effect, and other tasks whose completion the
    user needs recorded evidence of.
good_examples:
  - "The new item appearing at the top of the list with a transient '追加しました' notice offering 取り消し."
bad_examples:
  - "An alert saying '保存しました' with an OK button after every save."
review_check: >-
  Is each successful action confirmed by the resulting state change or a
  transient message rather than a dialog, except for consequential tasks?
related: [FOUND-002, DLG-002, DESTR-001]
sources:
  - title: Apple HIG — Feedback
    url: https://developer.apple.com/design/human-interface-guidelines/feedback
    tier: A
    note: Confirm completion only for significant tasks; people expect success.
  - title: Material Design 3 — Snackbar guidelines
    url: https://m3.material.io/components/snackbar/guidelines
    tier: A
last_verified: 2026-08-08
```

```yaml
id: STATE-008
title: Disabled states explain themselves or are avoided
area: states
subcategory: disabled
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Where a control or section is disabled, the design MUST state the condition
  that enables it; navigation destinations MUST NOT be disabled or hidden merely
  because their content is currently unavailable.
rationale: >-
  Disabled elements with no explanation are the most common form of silent dead
  end, and disappearing navigation destinations make the app's structure feel
  unstable.
values:
  ios: never disable or hide individual tab items — show an explanation in the empty section instead
applies_to:
  - action controls with prerequisites
  - navigation destinations
  - feature entry points behind entitlements
exceptions:
  - Controls whose unavailability is self-evident from adjacent visible state.
good_examples:
  - "An empty 'お気に入り' tab that stays visible and explains how to add favorites."
bad_examples:
  - "A greyed-out tab whose content has not synced yet."
review_check: >-
  For every disabled control or section, is the enabling condition stated in
  visible text, and do all navigation destinations remain present and enabled?
related: [BTN-004, STATE-004, NAV-007]
sources:
  - title: Apple HIG — Tab bars
    url: https://developer.apple.com/design/human-interface-guidelines/tab-bars
    tier: A
  - title: USWDS — Form component guidance
    url: https://designsystem.digital.gov/components/form/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: STATE-009
title: Permission-denied is a designed state, not an error
area: states
subcategory: permission
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Every feature depending on a runtime permission MUST have a designed
  permission-denied state that explains what is unavailable, offers any
  alternative path, and provides a route to system settings where re-granting is
  possible.
rationale: >-
  Denial is a normal outcome — including permanent denial, after which the OS no
  longer shows a prompt — so a feature that only works in the granted case is
  broken for a substantial share of users.
applies_to:
  - location, camera, photos, microphone, contacts, notifications
  - features gated behind those permissions
exceptions:
  - Features where the permission is inseparable from the app's core purpose,
    which must still explain the dependency rather than fail silently.
good_examples:
  - "A restaurant search offering manual area entry when location is denied, plus a link to settings."
bad_examples:
  - "A blank map screen after the user denies location access."
  - "Re-prompting on every launch after permanent denial."
review_check: >-
  For each permission-gated feature, is there a designed denied state with an
  explanation, an alternative path where one exists, and a route to settings?
related: [PERM-001, PERM-003, STATE-005]
sources:
  - title: Apple HIG — Onboarding
    url: https://developer.apple.com/design/human-interface-guidelines/onboarding
    tier: A
    note: Request permissions at first use of the dependent feature rather than up front.
  - title: NN/g — 10 Usability Heuristics (#9 Help users recognize, diagnose, and recover from errors)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```
