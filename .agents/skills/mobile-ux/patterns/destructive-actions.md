# Pattern: Destructive Actions

削除・破棄・退会など、ユーザーのデータや状態を失わせる操作のパターン。

## いつ使うか

削除、破棄、上書き、退会、サインアウト、購読解除など、実行後に元の状態へ戻すのがユーザー自身では難しい操作を設計するとき。

## 設計手順

1. **損失の大きさを見積もる** — 何が、どれだけ、どのくらいの期間失われるか。1件のチェック解除と全データ削除では必要な摩擦がまったく違う。
2. **可逆にできないかを先に検討する** — 論理削除＋Undo、ゴミ箱、アーカイブ。可逆にできるなら確認ダイアログより Undo を優先する（確認は毎回のコストだが、Undo は失敗時のみのコスト）。
3. **摩擦を損失に比例させる** — 下表を目安にする。
4. **文言を書く** — 対象・結果・可逆性を明示する（WRITE-007）。「よろしいですか？」で終わらせない。
5. **配置とスタイルを決める** — 破壊的スタイル、非デフォルト、主操作から離す（BTN-003, TOUCH-002）。
6. **完了後の状態を設計する** — 削除後にどこへ戻るか、リストが空になるなら empty state（STATE-004）が要る。

### 摩擦の目安

| 損失 | 例 | 推奨する摩擦 |
|------|-----|------------|
| 小・完全可逆 | チェック解除、お気に入り解除 | 確認なし。状態変化のみ |
| 中・復元可能 | 1件の削除（ゴミ箱あり） | 確認なし ＋ Undo（数秒間） |
| 大・復元不可 | 1件の完全削除、下書き破棄 | 確認ダイアログ（対象名を明示） |
| 甚大・復元不可 | 全データ削除、アカウント削除 | 確認ダイアログ ＋ 明示的な入力（アカウント名の入力など） |

## ルール

```yaml
id: DESTR-001
title: Prefer undo over confirmation for recoverable actions
area: patterns
subcategory: destructive-actions
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Actions whose effect can be reversed SHOULD be executed immediately with an
  undo affordance rather than gated behind a confirmation dialog; confirmation
  dialogs SHOULD be reserved for actions that cannot be undone.
rationale: >-
  Confirmation costs every user on every successful action, while undo costs only
  the users who made a mistake; overusing confirmation also trains reflexive
  dismissal, which weakens the prompts that actually matter.
applies_to:
  - single-item deletion with a trash or archive
  - archive, mute, and unsubscribe actions
  - list reordering and bulk state changes
exceptions:
  - Genuinely irreversible actions (see DESTR-002).
  - Actions with immediate external side effects (sending a message, submitting a payment).
good_examples:
  - "Deleting a book removes it and shows '削除しました [取り消す]' for a few seconds."
bad_examples:
  - "A confirmation dialog for un-checking a to-do item."
review_check: >-
  For each destructive action, is it either reversible with a visible undo, or
  genuinely irreversible and therefore confirmed?
related: [FOUND-003, STATE-007, DLG-002, DESTR-002]
sources:
  - title: Apple HIG — Alerts
    url: https://developer.apple.com/design/human-interface-guidelines/alerts
    tier: A
    note: Don't alert for common, undoable actions; do alert for uncommon, irreversible destructive actions.
  - title: NN/g — 10 Usability Heuristics (#3 User control and freedom)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: DESTR-002
title: Irreversible actions require confirmation that names the loss
area: patterns
subcategory: destructive-actions
severity: critical
stability: core
platforms: [ios, android]
rule: >-
  An action that permanently destroys user data MUST require an explicit
  confirmation that names what will be lost and states that it cannot be undone,
  and the friction MUST scale with the magnitude of the loss.
rationale: >-
  Permanent data loss is unrecoverable by definition; a mis-tap without
  confirmation cannot be repaired by any later interaction.
applies_to:
  - permanent deletion
  - account deletion and data reset
  - discarding unsaved work
  - bulk destructive operations
exceptions:
  - Deletions that route to a recoverable trash or archive (see DESTR-001).
good_examples:
  - "「吾輩は猫である」を削除しますか？ 読書記録も一緒に削除され、元に戻せません。 [キャンセル] [削除]"
  - "Account deletion requiring the user to type their account name."
bad_examples:
  - "A one-tap 'すべて削除' with no confirmation."
  - "'よろしいですか？ [OK] [キャンセル]' before wiping all data."
review_check: >-
  Does every irreversible destructive action require a confirmation that names
  the affected object, the consequence, and its irreversibility?
related: [WRITE-007, DLG-001, FORM-009, DESTR-003]
sources:
  - title: Apple HIG — Alerts
    url: https://developer.apple.com/design/human-interface-guidelines/alerts
    tier: A
  - title: WCAG 2.2 — 3.3.4 Error Prevention (Legal, Financial, Data)
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: Material Design 3 — Dialogs guidelines
    url: https://m3.material.io/components/dialogs/guidelines
    tier: A
last_verified: 2026-08-08
```

```yaml
id: DESTR-003
title: Separate destructive controls from frequent ones
area: patterns
subcategory: destructive-actions
severity: high
stability: convention
platforms: [ios, android]
rule: >-
  A destructive control MUST NOT be placed adjacent to a frequently used control
  or in the position where users expect the primary action, and SHOULD be placed
  behind a menu or in a less-trafficked area of the screen.
rationale: >-
  Users acquire motor memory for control positions; a destructive action sitting
  where the frequent action normally lives is triggered by habit rather than
  intent, and the confirmation dialog is then dismissed by the same habit.
applies_to:
  - list row actions
  - toolbars
  - detail screens
  - settings screens
exceptions:
  - Screens whose entire purpose is the destructive operation (e.g. a dedicated
    delete-account screen).
good_examples:
  - "Delete placed in an overflow menu while Share and Edit stay in the toolbar."
bad_examples:
  - "A trash icon directly beside the favorite icon in every list row."
  - "Delete rendered as the filled primary button where Save normally sits."
review_check: >-
  Is every destructive control positioned away from frequently used controls and
  outside the primary action position?
related: [BTN-003, TOUCH-002, DESTR-002]
sources:
  - title: NN/g — Touch Targets on Touchscreens
    url: https://www.nngroup.com/articles/touch-target-size/
    tier: B
    note: Opposing actions need spacing; roughly 2mm minimum.
  - title: Apple HIG — Buttons
    url: https://developer.apple.com/design/human-interface-guidelines/buttons
    tier: A
last_verified: 2026-08-08
```

## 関連ルール

BTN-003（破壊的操作のスタイルと配置）、WRITE-007（確認文言）、FORM-009（重要な送信の確認）、STATE-004（削除後の空状態）、TOUCH-002（隣接ターゲットの分離）。

## よくある失敗

- 可逆な操作にまで確認ダイアログを出し、確認そのものが形骸化する
- 確認文言が「よろしいですか？」で、何がどうなるのかを述べていない
- 削除ボタンが主操作と同じ位置・同じスタイルに置かれている
- 削除後にリストが空になるが empty state が設計されていない
