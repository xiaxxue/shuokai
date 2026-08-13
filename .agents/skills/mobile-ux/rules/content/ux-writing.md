# UX Writing

UI文言の規範。文言はコンポーネントと同格のレビュー対象とする。
日本語アプリでは本ファイルに加えて `rules/content/japanese-ux-writing.md` を必ず適用する。

```yaml
id: WRITE-001
title: Action labels name their outcome
area: content
subcategory: labels
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Every button, menu item, and link label MUST name the action it performs, using
  a specific verb or verb phrase; generic labels such as "OK", "実行", "送信",
  "はい/いいえ" MUST NOT be used where the outcome is not otherwise obvious.
rationale: >-
  Users tap without reading surrounding text; a label that does not state the
  outcome makes the consequence unpredictable, which is how accidental deletions
  and purchases happen.
values:
  ios: one- or two-word verb titles describing the result; avoid "OK" except in purely informational alerts
  android: labels ideally 1–3 words, sentence case, never truncated or wrapped
applies_to:
  - buttons and dialog actions
  - menu items
  - links and list row actions
exceptions:
  - A single acknowledgement button on a purely informational message, where "OK" is idiomatic.
good_examples:
  - "注文を確定 / 下書きを破棄 / この本を削除"
bad_examples:
  - "実行 / OK / はい"
review_check: >-
  Does every action label in this design name the specific outcome, with no
  generic "OK"/"実行"/"はい" used for a consequential action?
related: [WRITE-004, DLG-001, BTN-003]
sources:
  - title: Apple HIG — Alerts
    url: https://developer.apple.com/design/human-interface-guidelines/alerts
    tier: A
  - title: Material Design 3 — Buttons guidelines
    url: https://m3.material.io/components/buttons/guidelines
    tier: A
  - title: WCAG 2.2 — 2.4.4 Link Purpose (In Context)
    url: https://www.w3.org/TR/WCAG22/
    tier: A
last_verified: 2026-08-08
```

```yaml
id: WRITE-002
title: Error messages state the cause and the fix
area: content
subcategory: errors
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Every error message MUST state what went wrong in plain language and what the
  user can do next; error codes, internal exception text, and bare messages such
  as "エラーが発生しました" MUST NOT be shown as the only content.
rationale: >-
  A message that names neither the cause nor the remedy gives the user nothing to
  act on, so the only remaining options are to retry blindly or quit.
applies_to:
  - form validation errors
  - network and server failures
  - permission and capability failures
exceptions:
  - Security contexts where naming the precise cause would leak information
    (state the general problem and the next step instead).
good_examples:
  - "通信できませんでした。接続を確認して、もう一度お試しください。"
  - "郵便番号は7桁の数字で入力してください。"
bad_examples:
  - "エラーが発生しました (code: 500)"
  - "入力内容が不正です"
review_check: >-
  Does every error message name the specific problem and the action the user
  should take, without exposing codes or internal terms?
related: [WRITE-003, STATE-005, FORM-005, FORM-007]
sources:
  - title: NN/g — Error-Message Guidelines
    url: https://www.nngroup.com/articles/error-message-guidelines/
    tier: B
  - title: GOV.UK Design System — Error message
    url: https://design-system.service.gov.uk/components/error-message/
    tier: B
  - title: WCAG 2.2 — 3.3.3 Error Suggestion
    url: https://www.w3.org/TR/WCAG22/
    tier: A
last_verified: 2026-08-08
```

```yaml
id: WRITE-003
title: Do not blame, apologize, or joke in error copy
area: content
subcategory: errors
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Error copy MUST NOT blame the user ("〜し忘れました", "不正な入力"), MUST NOT
  rely on apologies in place of a solution, and SHOULD NOT use humor.
rationale: >-
  Blame raises the emotional cost of an already frustrating moment, apologies
  consume the line that should carry the fix, and jokes read as dismissive on the
  second encounter.
applies_to:
  - validation messages
  - failure screens
  - empty and permission-denied states
exceptions:
  - Genuine service outages where an apology is appropriate, provided the message
    also states status and next steps.
good_examples:
  - "メールアドレスを入力してください。"
bad_examples:
  - "入力し忘れています / 不正な値です / おっと！何かがおかしいようです"
review_check: >-
  Is every error message free of blame words, unnecessary apologies, and humor,
  while still stating the fix?
related: [WRITE-002, JA-003]
sources:
  - title: GOV.UK Design System — Error message
    url: https://design-system.service.gov.uk/components/error-message/
    tier: B
    note: Avoid blame words, "please", "sorry", "valid/invalid", and humor.
  - title: NN/g — Error-Message Guidelines
    url: https://www.nngroup.com/articles/error-message-guidelines/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: WRITE-004
title: Use the user's vocabulary, not the system's
area: content
subcategory: terminology
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  UI text MUST use words from the user's domain; internal system terms
  (entity names, API terms, status codes, "レコード", "オブジェクト", "同期キュー")
  MUST NOT appear in the interface without explanation.
rationale: >-
  Internal vocabulary forces users to build a mental model of the implementation
  before they can act, and it varies from the words they would use to search.
applies_to:
  - labels, headings, and messages
  - empty states
  - settings
exceptions:
  - Domain-specific technical apps whose users share the vocabulary.
good_examples:
  - "「本を追加」（対象がユーザーの語彙）"
bad_examples:
  - "「レコードを作成」「エンティティを同期」"
review_check: >-
  Would a first-time user of this app recognize every noun and verb in the UI
  without knowing how the app is implemented?
related: [FOUND-006, WRITE-005]
sources:
  - title: NN/g — 10 Usability Heuristics (#2 Match between the system and the real world)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
  - title: GOV.UK — Writing clear language
    url: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: WRITE-005
title: Keep UI copy short and concrete
area: content
subcategory: style
severity: low
stability: core
platforms: [ios, android]
rule: >-
  UI text SHOULD use short sentences and simple words, SHOULD prefer the active
  voice, and SHOULD state specifics rather than generalities.
values:
  govuk: split sentences over 25 words; keep paragraphs to no more than 5 sentences
applies_to:
  - descriptions and instructions
  - onboarding copy
  - empty states and confirmations
exceptions:
  - Legal text whose wording is prescribed.
rationale: >-
  Mobile reading happens in short, interrupted bursts on a small screen; long
  sentences are skipped rather than read.
good_examples:
  - "写真へのアクセスを許可すると、本の表紙を登録できます。"
bad_examples:
  - "本アプリケーションにおける写真ライブラリへのアクセス権限は、書籍情報の登録に際して必要となる場合がございますので、あらかじめご了承ください。"
review_check: >-
  Is every sentence in the UI under roughly 25 words, in the active voice, and
  specific about what happens?
related: [WRITE-004, JA-005]
sources:
  - title: GOV.UK — Writing clear language
    url: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
    tier: B
  - title: NN/g — 10 Usability Heuristics (#8 Aesthetic and minimalist design)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: WRITE-006
title: Empty and zero-result copy points to the next action
area: content
subcategory: empty-states
severity: medium
stability: core
platforms: [ios, android]
rule: >-
  Text in an empty or zero-result state MUST say why nothing is shown and name
  the action that changes it; "データがありません" alone MUST NOT be the whole message.
rationale: >-
  Users cannot tell whether an empty screen means "you have not added anything",
  "your filter excluded everything", or "the app failed", and each implies a
  different next step.
applies_to:
  - first-run states
  - search and filter results
  - archives and history
exceptions:
  - Sections that are empty by design and require no user action, where the
    reason alone suffices.
good_examples:
  - "まだ本を登録していません。「本を追加」から記録を始めましょう。"
  - "「夏目漱石」に一致する本はありません。条件を変えて検索してください。"
bad_examples:
  - "データがありません"
review_check: >-
  Does each empty-state message state the reason it is empty and name the action
  that resolves it?
related: [STATE-004, WRITE-001]
sources:
  - title: NN/g — 10 Usability Heuristics (#1 Visibility of system status)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: WRITE-007
title: Confirmation copy names the consequence and its scope
area: content
subcategory: confirmations
severity: high
stability: core
platforms: [ios, android]
rule: >-
  Confirmation prompts MUST state what will happen, to what, and whether it can
  be undone; the prompt MUST NOT ask a bare question such as "よろしいですか？"
  whose answer buttons do not name the outcome.
rationale: >-
  Confirmation only prevents mistakes if the user learns something from it; a
  content-free prompt is dismissed reflexively and provides no protection.
applies_to:
  - destructive confirmations
  - irreversible submissions
  - bulk operations
exceptions:
  - Reversible actions that should use undo instead of confirmation (see DESTR-001).
good_examples:
  - "「吾輩は猫である」を削除しますか？ 読書記録も一緒に削除され、元に戻せません。 [キャンセル] [削除]"
bad_examples:
  - "よろしいですか？ [OK] [キャンセル]"
review_check: >-
  Does every confirmation prompt name the affected object, the consequence, and
  reversibility, with buttons that name the outcome?
related: [WRITE-001, DESTR-002, DLG-001]
sources:
  - title: Apple HIG — Alerts
    url: https://developer.apple.com/design/human-interface-guidelines/alerts
    tier: A
  - title: Material Design 3 — Dialogs guidelines
    url: https://m3.material.io/components/dialogs/guidelines
    tier: A
    note: Avoid vague headlines such as "Are you sure?".
last_verified: 2026-08-08
```

```yaml
id: WRITE-008
title: Avoid ambiguous references and directional language
area: content
subcategory: style
severity: low
stability: core
platforms: [ios, android]
rule: >-
  UI text SHOULD NOT rely on demonstratives or spatial references ("こちら",
  "下のボタン", "上記の項目") to identify targets; it SHOULD name the target directly.
rationale: >-
  Layout changes with text size, orientation, and platform, and screen-reader
  users receive no spatial context at all, so positional references break.
values:
  wcag: 2.4.4 Link Purpose (In Context) — purpose must be determinable from the link text (A)
applies_to:
  - links and inline actions
  - instructions and helper text
exceptions:
  - References to an element named immediately adjacent in the same sentence.
good_examples:
  - "詳しい条件は「利用規約」で確認できます。"
bad_examples:
  - "詳しくはこちら / 下のボタンを押してください"
review_check: >-
  Does every instruction and link name its target rather than referring to it by
  position or as "こちら"?
related: [WRITE-001, A11Y-001]
sources:
  - title: WCAG 2.2 — 2.4.4 Link Purpose (In Context)
    url: https://www.w3.org/TR/WCAG22/
    tier: A
  - title: NN/g — 10 Usability Heuristics (#2 Match between the system and the real world)
    url: https://www.nngroup.com/articles/ten-usability-heuristics/
    tier: B
last_verified: 2026-08-08
```
