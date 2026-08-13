# Pattern: Widgets and Live Activities

ホーム画面ウィジェットと、進行中の事象を表示する常時表示要素（iOS の Live Activity 等）。

## いつ使うか

ユーザーが**アプリを開かずに一目で確認したい情報**があるとき。ウィジェットは「アプリのもう一つの入口」ではなく「アプリを開かずに済ませるための表示」であり、この違いが設計の分かれ目になる。

進行中の事象（配達・移動・試合）の追跡には、ウィジェットの定期更新や繰り返し通知ではなく Live Activity 系の仕組みを検討する。ただし持続時間には上限がある。

## 設計手順

1. **ウィジェットの用途を1つに絞る** — 情報表示 / コレクション / 操作 のどれか1つ。全部入りにしない
2. **その情報が変化するかを確認する** — 一日を通して見た目が変わらないウィジェットは、ユーザーがホーム画面から外す
3. **更新頻度の制約を前提に文言を決める** — ウィジェットはリアルタイム更新できない。ユーザーが更新頻度より高頻度で見る可能性があるなら、**最終更新時刻を表示する**
4. **placeholder（読み込み中）を設計する** — 設置直後は必ずこの状態になる。設計しないと空白のまま置かれる
5. **タップ先を決める** — ウィジェットの内容に**直接対応する画面**へ遷移させる。アプリのトップに落とさない
6. **機微情報の扱いを決める** — ホーム画面・ロック画面・常時表示ディスプレイは他人に見える（NOTIF-007）
7. **サイズを決める** — 「全サイズ提供」より「内容に最適な1サイズ」を優先する。小サイズの内容を引き伸ばして大サイズにしない

## ルール

```yaml
id: WIDGET-001
title: A widget shows information, not just a launcher
area: patterns
subcategory: widgets
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  A widget MUST present information that is useful without opening the app, and
  MUST NOT be merely an alternative way to launch it; each widget SHOULD serve a
  single primary use case rather than reproducing the app.
rationale: >-
  A widget occupies home-screen space the user could give to something else; if
  it shows nothing they could not get from the app icon, it is removed, and a
  widget that tries to do everything is unreadable at a glance.
values:
  scope: the widget is the glanceable portion; depth belongs in the app
  android_types: information / collection / control / hybrid — pick one primary use case
applies_to:
  - home screen and lock screen widgets
  - control-style widgets
exceptions:
  - Control widgets whose entire value is performing one action, which still must
    show the current state of the thing they control.
good_examples:
  - "A habit widget showing today's remaining habits and their completion state."
bad_examples:
  - "A widget showing only the app logo and name."
  - "A widget replicating the app's full dashboard at 4x2."
review_check: >-
  Does each widget convey information the user can act on without opening the
  app, limited to one primary use case?
related: [WIDGET-002, WIDGET-003, FOUND-005]
sources:
  - title: Apple HIG — Widgets
    url: https://developer.apple.com/design/human-interface-guidelines/widgets
    tier: A
  - title: Android Developers — App widgets overview
    url: https://developer.android.com/develop/ui/views/appwidgets/overview
    tier: A
last_verified: 2026-08-11
```

```yaml
id: WIDGET-002
title: Design the widget's placeholder, stale, and empty states
area: patterns
subcategory: widgets
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  A widget MUST have a designed placeholder state for while its data loads, and
  when its data can be older than the user's viewing frequency it MUST show when
  the data was last updated; empty content MUST be explained rather than rendered
  blank.
rationale: >-
  Widgets cannot update continuously, so a widget with no freshness indication
  presents stale numbers as current — which is worse than showing nothing — and a
  blank widget immediately after installation reads as broken.
values:
  ios: an installed widget shows placeholder content while loading; build it from static components plus semi-opaque shapes standing in for dynamic content
  refresh_limits: the system adjusts update frequency; no reliable minimum interval is published, so do not design around a specific refresh period
applies_to:
  - all widgets
  - lock screen and always-on surfaces
exceptions:
  - Widgets rendering only static, user-configured content that never goes stale.
good_examples:
  - "A weather widget showing '12:41 更新' beside the temperature."
  - "A skeleton-style placeholder matching the widget's final layout."
bad_examples:
  - "A stock price with no timestamp, refreshed at unpredictable intervals."
  - "A newly added widget rendering as an empty rounded rectangle."
review_check: >-
  Does each widget define its placeholder state, indicate data freshness when it
  can be stale, and explain emptiness rather than showing a blank area?
related: [WIDGET-001, STATE-002, STATE-004, NOTIF-007]
sources:
  - title: Apple HIG — Widgets
    url: https://developer.apple.com/design/human-interface-guidelines/widgets
    tier: A
  - title: Android Developers — App widgets overview
    url: https://developer.android.com/develop/ui/views/appwidgets/overview
    tier: A
last_verified: 2026-08-11
```

```yaml
id: WIDGET-003
title: Widget taps open the matching content
area: patterns
subcategory: widgets
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  Tapping a widget MUST open the screen corresponding to the content that was
  tapped, without requiring the user to navigate there; widget text MUST remain
  real text so it scales and can be read by assistive technology.
rationale: >-
  A widget that lands on the app's home screen makes the user find again what the
  widget just showed them, and rasterized text neither scales with the user's
  text size setting nor reaches screen readers.
values:
  ios: display widget text at 11 points or larger; always use text elements rather than rasterized text
  interactivity: keep interactive elements few — a single interactive element avoids accidental taps on an always-visible surface
applies_to:
  - widget tap targets
  - collection widgets with per-row destinations
exceptions:
  - Single-purpose control widgets that perform their action in place.
good_examples:
  - "Tapping a specific habit in the widget opens that habit's detail screen."
bad_examples:
  - "Every tap on a list widget opens the app's home tab."
  - "Rendering the widget's numbers as a pre-drawn image."
review_check: >-
  Does each tappable region of the widget deep-link to its own content, with all
  text rendered as real, scalable text?
related: [WIDGET-001, A11Y-001, TYPE-001, TOUCH-001]
sources:
  - title: Apple HIG — Widgets
    url: https://developer.apple.com/design/human-interface-guidelines/widgets
    tier: A
  - title: Android Developers — App widgets overview
    url: https://developer.android.com/develop/ui/views/appwidgets/overview
    tier: A
last_verified: 2026-08-11
```

```yaml
id: WIDGET-004
title: End live activities when the activity ends
area: patterns
subcategory: live-activities
severity: medium
stability: current
platforms: [ios]
rule: >-
  A live activity MUST be used only for an event with a defined beginning and end
  within a few hours, MUST be ended as soon as the task completes, MUST NOT be
  duplicated by push notifications for the same updates, and MUST be dismissible
  from within the app.
rationale: >-
  A live activity occupies the lock screen and always-on display continuously, so
  one that lingers after its event, or is mirrored by push notifications, turns a
  useful indicator into persistent noise — and users respond by disabling live
  activities entirely.
values:
  ios: designed for short-to-medium activities not exceeding eight hours; on completion the system removes it from the Dynamic Island immediately while the Lock Screen keeps it up to four hours, so set a custom dismissal typically 15–30 minutes
  alerts: alert only for essential updates, since alerting lights the screen and plays a sound
applies_to:
  - delivery and ride tracking
  - live scores and timers
  - multi-step processing with a known end
exceptions:
  - None for duration; activities longer than the platform envelope belong in the
    app with notifications at milestones.
good_examples:
  - "A delivery activity that ends at hand-off and sets a short dismissal window."
bad_examples:
  - "A live activity for an open-ended subscription status."
  - "Sending a push notification for each status change while a live activity shows the same changes."
review_check: >-
  Does each live activity have a defined end within the platform's duration
  envelope, end at completion, and avoid duplicate push notifications for the
  same updates?
related: [NOTIF-005, NOTIF-007, WIDGET-002]
sources:
  - title: Apple HIG — Live Activities
    url: https://developer.apple.com/design/human-interface-guidelines/live-activities
    tier: A
last_verified: 2026-08-11
```

## 関連ルール

NOTIF-007（常時表示面の機微情報）、STATE-002 / STATE-004（loading・empty の設計）、TYPE-001（文字拡大）、A11Y-001（アクセシブルネーム）、COLOR-003（色のみで伝えない — ウィジェットは単色化されることがある）。

## よくある失敗

- アプリを起動するだけのウィジェット（情報がない）
- 設置直後の placeholder を設計せず、空白のまま置かれる
- 更新頻度の制約を無視し、古い数値を現在の値として見せる
- タップするとアプリのトップに飛び、内容を探し直させる
- ロック画面のウィジェットや Live Activity に個人情報を出す
- 事象が終わっても Live Activity が残り続ける
