# Pattern: Onboarding

初回起動時の導入体験。

## いつ使うか

アプリの価値がひと目で分からない、または最初に最小限の設定が必要な場合のみ。
「一般にオンボーディングは付けるものだから」という理由で追加しない。まず**オンボーディングなしで理解できるアプリ**を目指し、それでも埋まらない差分だけを扱う。

## 設計手順

1. **オンボーディングを不要にできないか検討する** — 空状態（STATE-004）の文言と1つのCTAで足りることは多い。読書記録アプリなら「まだ本を登録していません／本を追加」で十分。
2. **本当に必要な項目だけ残す** — 初回に必須なのは、それがないとアプリが1つの価値も返せない設定だけ。残りは既定値を置いて後から変更可能にする。
3. **説明ではなく体験にする** — 機能ツアーの静止画を並べるより、最初の1件を実際に作らせるほうが理解も定着も早い。
4. **スキップ手段を用意する** — いつでも抜けられ、後から見返せる場所を用意する。
5. **権限要求を分離する** — オンボーディング中にまとめて要求しない（PERM-001, PERM-002）。アプリが権限なしに一切機能しない場合のみ例外。
6. **再表示しない** — 完了・スキップの後は起動のたびに出さない。

## ルール

```yaml
id: ONBD-001
title: Onboarding is skippable and never repeated
area: patterns
subcategory: onboarding
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  An onboarding flow MUST be skippable at any step, MUST NOT be shown again on
  later launches once completed or skipped, and its content SHOULD remain
  findable afterwards.
rationale: >-
  Users who already understand the app, returning users, and users reinstalling
  are blocked from their task by a flow that teaches them nothing, which is a
  common cause of first-session abandonment.
applies_to:
  - first-run tours
  - setup wizards
  - feature introduction sequences
exceptions:
  - Steps that are legally required (e.g. terms acceptance) or without which the
    app cannot function at all.
good_examples:
  - "A three-step intro with a persistent スキップ control, re-openable from settings."
bad_examples:
  - "A five-screen carousel with no skip that reappears after every app update."
review_check: >-
  Can the user skip the onboarding at every step, and is it guaranteed not to
  reappear on subsequent launches?
related: [FOUND-004, ONBD-002, PERM-002]
sources:
  - title: Apple HIG — Onboarding
    url: https://developer.apple.com/design/human-interface-guidelines/onboarding
    tier: A
    note: Make the flow fast, fun, and optional — skippable, not re-shown on later launches, findable later.
  - title: NN/g — 10 Usability Heuristics (#3 User control and freedom)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: ONBD-002
title: Deliver value before asking for setup
area: patterns
subcategory: onboarding
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Onboarding SHOULD let the user reach the app's core value before requesting
  account creation, permissions, or non-essential configuration; setup that can
  use a sensible default MUST be postponed rather than demanded up front.
rationale: >-
  Users judge whether the app is worth their data within the first session; asking
  for sign-up and permissions before showing anything inverts that exchange and
  loses users who would have converted after seeing the value.
applies_to:
  - sign-up walls
  - permission requests during onboarding
  - preference and profile setup
exceptions:
  - Apps whose core value strictly requires an account (banking, workplace tools)
    or a specific permission.
good_examples:
  - "Letting the user record their first book locally, then offering an account to sync across devices."
bad_examples:
  - "A sign-up wall plus three permission prompts before any screen of the app is visible."
review_check: >-
  Can the user experience the app's primary value before being asked to create an
  account, grant permissions, or configure preferences?
related: [ONBD-001, PERM-001, FOUND-001]
sources:
  - title: Apple HIG — Onboarding
    url: https://developer.apple.com/design/human-interface-guidelines/onboarding
    tier: A
    note: Teach through interactivity; postpone nonessential setup with sensible defaults; don't prompt before engagement.
  - title: NN/g — 10 Usability Heuristics (#10 Help and documentation)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

## 関連ルール

PERM-001 / PERM-002（権限要求のタイミング）、STATE-004（空状態が担うオンボーディング）、FOUND-004（ユーザーの制御と自由）。

## よくある失敗

- 機能紹介の静止画カルーセルを3〜5枚並べ、スキップできない
- オンボーディング中に権限をまとめて要求する
- 何も使わないうちからアカウント作成を要求する
- 空状態を設計せず、その代わりにオンボーディングで説明しようとする
