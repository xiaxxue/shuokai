# Pattern: Notifications

プッシュ通知・ローカル通知の設計。

## いつ使うか

ユーザーがアプリを開いていない間に起きた、**その人にとって時間的価値のある事象**を伝えるとき。「再訪してほしい」はアプリ側の都合であり、通知の理由にならない。

## 最初に理解すべき構造変化

**通知はもう「届く前提」で設計できない。**

- **Android 13（API 33）で通知が実行時権限になった。** 新規インストールは通知OFFがデフォルトで、ユーザーが明示的に許可しない限り一切表示されない
- **iOS の許可プロンプトは1回きり。** 拒否されると、アプリ内から再度プロンプトを出す手段はない（設定アプリへ誘導するしかない）
- 両OSとも、ユーザーはいつでも種類ごとに無効化できる

したがって、**通知に依存した導線は設計として成立しない**（NOTIF-001）。

## 設計手順

1. **通知の種類を洗い出し、それぞれの価値を判定する** — 「この通知が来なかったらユーザーは何を損するか」に答えられないものは作らない
2. **Android のチャネル分類を決める（リリース前に確定させること）** — チャネルは作成後に importance・音・振動を変更できない。名前と説明しか変えられないため、後から分類をやり直せない
3. **要求のタイミングを決める** — 初回起動で求めない。ユーザーが通知を欲する意思を示した操作（フォロー、リマインダー設定、注文完了など）に紐付ける
4. **割り込みレベルを決める** — 高い割り込み（iOS の Time Sensitive、Android の高 importance）は「今から1時間以内に意味を失う事象」に限る
5. **文言と機微情報の扱いを決める** — ロック画面や通知センターは他人が見る可能性がある。伏せた表示の文言を別途用意する
6. **タップ後の遷移先を決める** — 全通知に遷移先が要る。「アプリ内で〜してください」という手順を通知に書かない
7. **アプリ内の通知設定を用意する** — OS の設定に丸投げしない
8. **拒否された場合の設計をする** — 通知が届かない前提でも機能が成立することを確認する（PERM-003 / STATE-009）

## ルール

```yaml
id: NOTIF-001
title: Never make a notification the only path to a flow
area: patterns
subcategory: notifications
severity: high
stability: current
platforms: [ios, android]
rule: >-
  A notification MUST NOT be the only way to reach a task, discover a state
  change, or complete a flow; every notification's destination MUST also be
  reachable from inside the app.
rationale: >-
  Notifications are off by default for new installs on current Android, the iOS
  prompt cannot be shown twice, and users can silence any category at any time —
  so a flow gated behind a notification is simply unreachable for a large share
  of users.
values:
  android: POST_NOTIFICATIONS is a runtime permission since API 33; new installs default to notifications disabled
  ios: the authorization prompt is presented only once and cannot be re-shown from within the app
applies_to:
  - order, delivery, and booking status
  - messages and mentions
  - reminders and scheduled events
  - security and account alerts
exceptions:
  - None. Even for security alerts, an in-app path must exist.
good_examples:
  - "A delivery status notification whose content is also on the order screen, with the same detail."
bad_examples:
  - "A reminder app whose only way to see today's items is the notification it posted."
review_check: >-
  For every notification in this design, is its information and its destination
  also reachable from inside the app without the notification?
related: [NOTIF-002, PERM-003, STATE-009]
sources:
  - title: Android Developers — Notification runtime permission
    url: https://developer.android.com/develop/ui/views/notifications/notification-permission
    tier: A
  - title: Apple HIG — Notifications
    url: https://developer.apple.com/design/human-interface-guidelines/notifications
    tier: A
last_verified: 2026-08-11
```

```yaml
id: NOTIF-002
title: Ask for notification permission from an intent-revealing action
area: patterns
subcategory: notifications
severity: high
stability: current
platforms: [ios, android]
rule: >-
  The notification permission MUST NOT be requested at first launch; it MUST be
  requested at the point the user takes an action that implies wanting to be
  notified, and the value MUST be explained before the system prompt appears.
rationale: >-
  The prompt is effectively one-shot — on iOS it cannot be shown again, and on
  Android a denial is expensive to recover from — so spending it before the user
  has any reason to say yes permanently loses the channel.
values:
  android: for targetSdk 33+, the app fully controls when the prompt is shown; for targetSdk 32 or lower the system shows it on first channel creation, which the app cannot time
  ios: request in context rather than at first launch; provisional authorization can deliver quietly to Notification Center without a prompt as a trial
applies_to:
  - reminder and alarm features
  - follow / subscribe actions
  - order and delivery tracking
  - chat and messaging
exceptions:
  - Apps whose single purpose is delivering alerts, which may request during
    onboarding — still after explaining the value.
good_examples:
  - "Setting a reminder time triggers an explanation and then the system prompt."
  - "Using provisional authorization to deliver quietly, then asking for full permission once the user engages."
bad_examples:
  - "Requesting notifications on the first screen after install, before showing any content."
review_check: >-
  Is each notification permission request triggered by a user action that implies
  wanting notifications, preceded by an in-app explanation, and never at launch?
related: [PERM-001, PERM-002, NOTIF-001]
sources:
  - title: Android Developers — Notification runtime permission
    url: https://developer.android.com/develop/ui/views/notifications/notification-permission
    tier: A
  - title: Apple HIG — Notifications
    url: https://developer.apple.com/design/human-interface-guidelines/notifications
    tier: A
last_verified: 2026-08-11
```

```yaml
id: NOTIF-003
title: Decide Android notification channels before the first release
area: patterns
subcategory: notifications
severity: medium
stability: current
platforms: [android]
rule: >-
  Every Android notification MUST belong to a channel, and the channel taxonomy
  MUST be finalized before release because a channel's importance, sound, and
  vibration cannot be changed after creation — only its name and description can.
rationale: >-
  Users disable notifications per category; if unrelated notification types share
  one channel, silencing the noisy one also silences the important one, and the
  app cannot fix the split later without abandoning the channel.
values:
  android: channels are required from API 26; importance has five levels; after creation only name and description are mutable
applies_to:
  - all Android notifications
exceptions:
  - Exempted notification types such as media sessions and self-managed calls,
    which still benefit from sensible categorization.
good_examples:
  - "Separate channels for '配送状況', 'メッセージ', and 'おすすめ', so users can keep the first two and silence the third."
bad_examples:
  - "A single '通知' channel carrying both delivery alerts and promotions."
review_check: >-
  Does each distinct kind of notification have its own channel, with the taxonomy
  and importance levels fixed before release?
related: [NOTIF-004, NOTIF-005]
sources:
  - title: Android Developers — Create and manage notification channels
    url: https://developer.android.com/develop/ui/views/notifications/channels
    tier: A
last_verified: 2026-08-11
```

```yaml
id: NOTIF-004
title: Reserve high-interruption delivery for time-critical events
area: patterns
subcategory: notifications
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  High-interruption delivery — iOS Time Sensitive and Android high importance
  with a heads-up alert — MUST be limited to events that lose their value within
  about an hour, and MUST NOT be used for marketing or engagement prompts.
rationale: >-
  Interruption levels that break through focus modes are a shared resource; when
  an app spends them on promotions, users disable the app's notifications
  entirely and the genuinely urgent alerts are lost with them.
values:
  ios: Time Sensitive is scoped to events happening now or within the hour, and the system offers the user a switch to turn it off on first use; marketing use is explicitly disallowed
  android: high importance produces a heads-up alert; the system does not guarantee alerting behavior in every state
applies_to:
  - delivery arrival, ride arrival
  - security and fraud alerts
  - live event start
  - promotions (which must not use it)
exceptions:
  - Communication notifications, which the platforms treat separately.
good_examples:
  - "'配達員が到着しました' as Time Sensitive; '週末セール開催中' as a normal notification."
bad_examples:
  - "Marking a re-engagement reminder Time Sensitive so it breaks through Focus."
review_check: >-
  Is every high-interruption notification tied to an event that becomes worthless
  within about an hour, with no marketing content among them?
related: [NOTIF-003, NOTIF-005]
sources:
  - title: Apple HIG — Notifications (interruption levels)
    url: https://developer.apple.com/design/human-interface-guidelines/notifications
    tier: A
  - title: Android Developers — Notification channels (importance)
    url: https://developer.android.com/develop/ui/views/notifications/channels
    tier: A
last_verified: 2026-08-11
```

```yaml
id: NOTIF-005
title: Do not repeat notifications for the same thing
area: patterns
subcategory: notifications
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  The same event MUST NOT generate repeated notifications; updates to an ongoing
  event SHOULD replace the previous notification rather than adding another.
rationale: >-
  Repetition is the fastest route to a user disabling the app's notifications
  permanently, and the platforms already suppress it — sounds are capped, updates
  are rate-limited, and once several notifications accumulate the system groups
  them so the individual message is lost anyway.
values:
  android: notification sound is capped at roughly one per second (8.1+); rapid updates are rate-limited and dropped; repetitive notifications are attenuated by a cooldown (15+); several notifications from one app are automatically grouped
applies_to:
  - progress and status updates
  - unread reminders
  - re-engagement prompts
exceptions:
  - Escalating alerts for safety-critical events the user has not acknowledged.
good_examples:
  - "Updating the existing delivery notification in place as the status changes."
bad_examples:
  - "Posting '未読メッセージがあります' every hour until the user opens the app."
review_check: >-
  Does each event produce at most one live notification, with updates replacing
  rather than adding to it?
related: [NOTIF-004, NOTIF-006]
sources:
  - title: Android Developers — Notifications overview
    url: https://developer.android.com/develop/ui/compose/notifications
    tier: A
  - title: Apple HIG — Notifications
    url: https://developer.apple.com/design/human-interface-guidelines/notifications
    tier: A
last_verified: 2026-08-11
```

```yaml
id: NOTIF-006
title: Every notification lands somewhere useful and states its own content
area: patterns
subcategory: notifications
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  Tapping a notification MUST open the specific content it refers to, not just
  the app's home screen, and the notification text MUST carry the information
  itself rather than instructing the user to go and look for it.
rationale: >-
  A notification that drops the user at the top of the app makes them re-find
  what they were told about, and one that says only "アプリを開いて確認してください"
  has spent an interruption without delivering anything.
values:
  ios: notification actions are limited (up to four) and should be labeled with the resulting action; alerts, not notifications, are the right tool for in-app errors
  android: every notification must respond to a tap with a destination
applies_to:
  - all notifications
exceptions:
  - Notifications whose content must stay hidden for privacy, which still need a
    destination (see NOTIF-007).
good_examples:
  - "'田中さん: 明日の件ですが…' opening that conversation directly."
bad_examples:
  - "'新しい通知があります。アプリを開いてください' opening the home tab."
review_check: >-
  Does each notification state its own content and deep-link to the exact screen
  it refers to?
related: [NOTIF-005, NOTIF-007, WRITE-002]
sources:
  - title: Apple HIG — Notifications
    url: https://developer.apple.com/design/human-interface-guidelines/notifications
    tier: A
  - title: Android Developers — Notifications overview
    url: https://developer.android.com/develop/ui/compose/notifications
    tier: A
last_verified: 2026-08-11
```

```yaml
id: NOTIF-007
title: Keep sensitive content off always-visible surfaces
area: patterns
subcategory: notifications
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Notifications, live activities, and widgets MUST NOT expose sensitive content
  on the lock screen or other always-visible surfaces; a redacted alternative
  MUST be defined for those surfaces.
rationale: >-
  The lock screen is visible to anyone near the device, including people the user
  did not choose to share with, so private content shown there is disclosed
  without consent.
values:
  ios: provide a hidden-preview placeholder so the alert can be shown without its content
  android: lock-screen visibility has three levels; use the private level with a separate public version of the notification
applies_to:
  - messages and message previews
  - health, financial, and account data
  - two-factor codes
  - widgets and live activities showing personal data
exceptions:
  - Content the user explicitly configured to show, through an in-app setting.
good_examples:
  - "'新しいメッセージが1件' on the lock screen, with the sender and text visible only after unlock."
bad_examples:
  - "A banking widget showing the account balance on an always-on display."
review_check: >-
  For every notification, live activity, and widget carrying personal data, is a
  redacted variant defined for the lock screen and always-visible surfaces?
related: [NOTIF-006, WIDGET-002]
sources:
  - title: Apple HIG — Notifications (privacy)
    url: https://developer.apple.com/design/human-interface-guidelines/notifications
    tier: A
  - title: Android Developers — Notifications overview (lock screen visibility)
    url: https://developer.android.com/develop/ui/compose/notifications
    tier: A
last_verified: 2026-08-11
```

```yaml
id: NOTIF-008
title: Provide notification preferences inside the app
area: patterns
subcategory: notifications
severity: low
stability: convention
platforms: [ios, android]
rule: >-
  Apps sending more than one kind of notification SHOULD offer in-app controls
  for those kinds and SHOULD link to the system notification settings, rather
  than leaving all control to the OS.
rationale: >-
  When the only control is the OS switch, a user annoyed by one category turns
  off everything, which costs the app the categories the user actually wanted.
applies_to:
  - apps with multiple notification categories
  - marketing or digest notifications
exceptions:
  - Apps with a single notification type, where the OS control is sufficient.
good_examples:
  - "A settings screen listing each notification type with its own switch, plus a link to system settings."
bad_examples:
  - "No in-app settings, so silencing promotions also silences delivery alerts."
review_check: >-
  Does the app expose per-category notification controls in its own settings and
  link to the system settings?
related: [NOTIF-003, NOTIF-005]
sources:
  - title: Apple HIG — Notifications
    url: https://developer.apple.com/design/human-interface-guidelines/notifications
    tier: A
  - title: Android Developers — Create and manage notification channels
    url: https://developer.android.com/develop/ui/views/notifications/channels
    tier: A
last_verified: 2026-08-11
```

## 関連ルール

PERM-001 / PERM-002（権限要求のタイミング）、PERM-003 / STATE-009（拒否後の設計）、WRITE-002（文言）、`patterns/widgets.md`（常時表示面の設計）。

## よくある失敗

- 初回起動で通知許可を求め、拒否されて復旧できなくなる
- 通知が届く前提で導線を設計し、通知OFFのユーザーが機能に到達できない
- 全通知を1つのチャネルに入れ、宣伝を嫌ったユーザーに配送通知まで切られる
- 「アプリを開いて確認してください」だけの通知
- ロック画面にメッセージ本文や残高が出る
