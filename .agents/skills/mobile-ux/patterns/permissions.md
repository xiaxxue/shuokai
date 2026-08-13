# Pattern: Permissions

位置情報・カメラ・写真・通知などの実行時権限を要求するパターン。

## いつ使うか

機能の実行に OS の実行時権限が必要な場合。権限が不要な代替手段がある場合は、まず代替手段だけで成立しないかを検討する。

## 設計手順

1. **その権限が本当に必要かを判定する** — 写真を1枚選ぶだけならフォトピッカー（全ライブラリへのアクセス権限が不要な仕組み）で足りることが多い。権限を要求せずに済むAPIを先に探す。
2. **要求タイミングを決める** — 依存する機能をユーザーが初めて使おうとした瞬間に要求する。起動直後やオンボーディング中に前倒ししない（アプリがその権限なしには一切機能しない場合を除く）。
3. **事前説明（priming）を書く** — システムダイアログの前に、「何のために」「ユーザーにとって何が良くなるか」を1〜2文で提示する。
4. **3つの結果すべてを設計する** — 許可 / 拒否 / 恒久的拒否（以後OSがダイアログを出さない）。恒久的拒否は必ず発生する前提で設計する。
5. **拒否時の代替経路を用意する** — 手入力・ファイル選択・機能の縮退など。代替がない場合も、何が使えないかと設定への導線を示す。
6. **再要求の方針を決める** — 起動のたびに再要求しない。ユーザーが該当機能を再び使おうとしたときにのみ、設定への導線を示す。

## ルール

```yaml
id: PERM-001
title: Explain why before requesting a permission
area: patterns
subcategory: permissions
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Before the system permission dialog appears, the app MUST explain in its own UI
  what the permission is used for and what the user gains, and MUST request it at
  the point the dependent feature is first used rather than at launch.
rationale: >-
  A system dialog shown without context is denied by default by many users, and
  on both platforms a denial is difficult or impossible to reverse in-app, so the
  feature is lost for reasons unrelated to its value.
applies_to:
  - location, camera, photos, microphone, contacts, calendar
  - notifications
  - background activity
exceptions:
  - Apps that cannot function at all without the permission, which may request it
    during onboarding — still with an explanation first.
good_examples:
  - "Tapping '現在地から探す' shows '近くのお店を表示するために位置情報を使います' before the system prompt."
bad_examples:
  - "Requesting location, notifications, and contacts in sequence on first launch."
review_check: >-
  Does each permission request appear at first use of its feature, preceded by an
  in-app explanation of the purpose and benefit?
related: [PERM-002, PERM-003, STATE-009, ONBD-002]
sources:
  - title: Apple HIG — Onboarding
    url: https://developer.apple.com/design/human-interface-guidelines/onboarding
    tier: A
    note: Integrate permission requests into onboarding only if the app can't function without them; otherwise request at first use.
  - title: NN/g — 10 Usability Heuristics (#2 Match between the system and the real world)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: PERM-002
title: Never request multiple permissions at launch
area: patterns
subcategory: permissions
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Permission requests MUST NOT be queued back-to-back at app launch, and MUST NOT
  be combined with other launch-time prompts such as update notices, rating
  requests, or promotional dialogs.
rationale: >-
  A queue of prompts before the user has seen any value trains reflexive
  dismissal, which loses both the permissions and any consequential prompt shown
  later in the session.
applies_to:
  - first launch
  - post-update launches
  - onboarding flows
exceptions:
  - A single permission that the app's core function strictly requires.
good_examples:
  - "Requesting notification permission only after the user creates their first reminder."
bad_examples:
  - "Launch showing a what's-new dialog, then a location prompt, then a notification prompt."
review_check: >-
  Does the launch sequence present at most one prompt, with permissions deferred
  to the first use of their feature?
related: [PERM-001, DLG-004, ONBD-001]
sources:
  - title: Apple HIG — Alerts
    url: https://developer.apple.com/design/human-interface-guidelines/alerts
    tier: A
    note: Avoid alerts at app launch; don't prompt for ratings before engagement.
  - title: Apple HIG — Modality
    url: https://developer.apple.com/design/human-interface-guidelines/modality
    tier: A
last_verified: 2026-08-08
```

```yaml
id: PERM-003
title: Keep the feature usable after denial
area: patterns
subcategory: permissions
severity: high
stability: core
platforms: [ios, android]
rule: >-
  After a permission is denied, the app MUST NOT re-prompt on every launch, MUST
  state what is unavailable, and MUST offer either an alternative path or a route
  to system settings.
rationale: >-
  Denial is permanent from the app's perspective once the OS stops showing the
  dialog; without an alternative or a settings route the user is left with a
  feature that appears broken and no way to fix it.
applies_to:
  - location-dependent features
  - camera and photo features
  - notification-dependent reminders
exceptions:
  - None — even strictly permission-dependent features must explain the situation
    and link to settings.
good_examples:
  - "Location denied → manual area picker plus '設定で位置情報を許可する' link."
bad_examples:
  - "Showing the same rationale dialog on every launch after the user denied twice."
  - "A camera screen that stays black with no message after denial."
review_check: >-
  After denial, does the feature explain what is unavailable, avoid repeat
  prompting, and provide an alternative or a settings route?
related: [PERM-001, STATE-009, STATE-005]
sources:
  - title: Apple HIG — Onboarding
    url: https://developer.apple.com/design/human-interface-guidelines/onboarding
    tier: A
  - title: NN/g — 10 Usability Heuristics (#9 Help users recognize, diagnose, and recover from errors)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

## 関連ルール

STATE-009（permission-denied 状態の設計）、DLG-004（ダイアログの多重表示禁止）、ONBD-001（スキップ可能なオンボーディング）。

## よくある失敗

- 起動直後に権限をまとめて要求し、すべて拒否される
- 拒否後の画面が空白のまま、または汎用エラーになる
- 恒久的拒否を考慮せず、OSがもう表示しないダイアログを呼び続ける
- 事前説明が「許可してください」だけで、ユーザー側の利益を説明していない
