# Japanese UX Writing

日本語UIに固有の文言・表記規範。`rules/content/ux-writing.md`（WRITE-*）に**加えて**適用する。
一般則（結果を示すラベル、原因＋対処のエラー、責めない、簡潔）は WRITE-* が正本であり、ここでは日本語固有の観点のみを規定する。

出典の中心はデジタル庁デザインシステム（DADS, Tier B）。DADS は行政サービス向けだが、日本語の入力・表記慣習に関する規範として一般アプリにも適用できる。

```yaml
id: JA-001
title: 必須・任意は全角「※」付きラベルで示す
area: content
subcategory: form-notation
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  日本語フォームでは、必須・任意の別を「※必須」「※任意」のように全角「※」で
  始まるラベルで示すべきである。記号のみ（赤いアスタリスク単独）で示してはならない。
rationale: >-
  日本語UIでは本文と記号が視覚的に紛れやすく、記号単独の必須表示は意味が伝わらない。
  「※」始まりのラベルは通常の本文と区別され、読み上げでも意味が保たれる。
values:
  ja: 全角「※」+「必須」/「任意」
applies_to:
  - 入力フォームのラベル
  - フォーム冒頭の凡例
exceptions:
  - 単一項目のフォームで、必須であることが自明な場合。
good_examples:
  - "メールアドレス ※必須"
  - "電話番号 ※任意"
bad_examples:
  - "メールアドレス *"
  - "凡例のない赤いアスタリスクのみ"
review_check: >-
  必須・任意の表示が「※必須」「※任意」形式のテキストラベルになっており、
  記号のみに依存していないか？
related: [FORM-002, COLOR-003]
sources:
  - title: デジタル庁デザインシステム — インプットテキスト
    url: https://design.digital.go.jp/dads/components/input-text/usage/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: JA-002
title: エラーテキストは全角「＊」で始め、誤りと直し方を書く
area: content
subcategory: errors
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  日本語のフィールドエラーは全角「＊」で始め、「何が誤っているか」と
  「どう直すか」の両方を一文で示すべきである。
rationale: >-
  記号による視覚的識別と、原因・対処の明示を同時に満たすことで、色を知覚できない
  ユーザーにもエラー箇所と修正方法が伝わる。
values:
  ja: 全角「＊」始まり
applies_to:
  - インラインのフィールドエラー
exceptions:
  - プロダクト全体で別のエラー表記体系が定義されており、一貫して適用されている場合。
good_examples:
  - "＊郵便番号は7桁の数字で入力してください"
bad_examples:
  - "入力エラー"
  - "赤枠のみでテキストなし"
review_check: >-
  各フィールドエラーが「＊」始まりで、誤りの内容と修正方法の両方を含んでいるか？
related: [WRITE-002, FORM-005, FORM-007]
sources:
  - title: デジタル庁デザインシステム — インプットテキスト
    url: https://design.digital.go.jp/dads/components/input-text/usage/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: JA-003
title: 全角・半角の違いをエラーで弾かない
area: content
subcategory: input-normalization
severity: high
stability: convention
platforms: [ios, android]
rule: >-
  日本語フォームでは入力文字種を原則として制限してはならない。全角・半角、
  ハイフンの有無などの表記ゆれはエラーとして拒否せず、送信時または確認画面で
  システム側が自動変換する。
rationale: >-
  日本語入力ではIMEの状態により全角・半角が容易に混在し、これを利用者側の誤りとして
  差し戻すのは、システムが機械的に解決できる問題を利用者に押し付ける行為である。
  日本語フォームの離脱要因として最も一般的なものの一つ。
applies_to:
  - 電話番号・郵便番号・数値入力
  - 氏名・カナ入力
  - メールアドレス
exceptions:
  - 外部システムの制約により表記を厳密に一致させる必要があり、かつ自動変換が
    不可能な場合（その場合も入力前に条件を明示する）。
good_examples:
  - "「０９０-１２３４-５６７８」を受け付け、送信時に半角へ正規化する"
bad_examples:
  - "「半角で入力してください」というエラーで送信を拒否する"
review_check: >-
  全角・半角やハイフン有無の違いが、エラーではなくシステム側の自動変換で
  処理される設計になっているか？
related: [FOUND-003, FORM-004, FORM-005]
sources:
  - title: デジタル庁デザインシステム — インプットテキスト
    url: https://design.digital.go.jp/dads/components/input-text/usage/
    tier: B
    note: 入力文字種を原則制限せず、送信時・確認画面で自動変換する。
last_verified: 2026-08-08
```

```yaml
id: JA-004
title: サポートテキストで入力条件を示し、プレースホルダーで代用しない
area: content
subcategory: form-notation
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  入力形式・例・条件はラベルの下のサポートテキストとして常時表示すべきであり、
  プレースホルダーで代用してはならない。
rationale: >-
  日本語の入力条件（カナ／漢字、区切り方、桁数）は入力中こそ参照されるが、
  プレースホルダーは入力開始と同時に消えるため、最も必要な瞬間に失われる。
applies_to:
  - カナ入力欄
  - 住所・電話番号・郵便番号
  - 形式指定のある自由入力
exceptions:
  - 検索欄など、入力対象が自明でサポートテキストが冗長になる場合。
good_examples:
  - "氏名（カタカナ） / サポートテキスト: 氏（カタカナ）と名（カタカナ）を空白で区切ってください"
bad_examples:
  - "プレースホルダーに「ヤマダ タロウ」とだけ書かれた入力欄"
review_check: >-
  入力形式や例が、プレースホルダーではなく常時表示のサポートテキストで
  示されているか？
related: [FORM-001, FORM-004]
sources:
  - title: デジタル庁デザインシステム — インプットテキスト
    url: https://design.digital.go.jp/dads/components/input-text/usage/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: JA-005
title: 敬体を統一し、過剰な敬語を避ける
area: content
subcategory: tone
severity: low
stability: convention
platforms: [ios, android]
rule: >-
  UI文言の文体は敬体（ですます）で統一すべきであり、同一アプリ内で常体と敬体を
  混在させない。二重敬語や「〜させていただきます」等の冗長な敬語表現は避ける。
rationale: >-
  文体の混在は書き手が複数いる印象を与えて信頼性を損ない、過剰な敬語は
  小さな画面で読む文章を無駄に長くして要点を埋もれさせる。
applies_to:
  - 説明文・確認文
  - エラーメッセージ
  - 空状態の文言
exceptions:
  - ボタンラベル・見出し・リスト項目などの体言止め（これらは敬体の対象外）。
good_examples:
  - "通信できませんでした。接続を確認して、もう一度お試しください。"
bad_examples:
  - "通信エラー。接続を確認せよ。（常体と敬体の混在）"
  - "確認させていただきますようお願い申し上げます。"
review_check: >-
  アプリ内の説明文・メッセージがすべて敬体で統一され、二重敬語や冗長な
  謙譲表現を含んでいないか？
related: [WRITE-005, FOUND-006]
sources:
  - title: GOV.UK — Writing clear language
    url: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/
    tier: B
    note: 平易・簡潔・能動態という一般原則の日本語への適用。
  - title: デジタル庁デザインシステム — アクセシビリティ
    url: https://design.digital.go.jp/dads/guidance/accessibility/
    tier: B
last_verified: 2026-08-08
```

```yaml
id: JA-006
title: ボタンラベルは短い動詞句にし、体言止めの曖昧さを避ける
area: content
subcategory: labels
severity: medium
stability: convention
platforms: [ios, android]
rule: >-
  日本語のアクションラベルは「〜する」形の短い動詞句、または動作が一意に定まる
  体言止めにすべきであり、動作か対象かが判別できない語（「確認」「設定」単独など）を
  アクションラベルに使ってはならない。
rationale: >-
  日本語では同じ語が名詞にも動詞にも読めるため、「確認」だけでは「確認する」のか
  「確認画面へ移動する」のか「確認結果を表示する」のかが判別できない。
applies_to:
  - ボタン・ダイアログのアクション
  - メニュー項目
exceptions:
  - ナビゲーション先を示すタブ・見出しラベル（動作ではなく場所を指すため名詞が適切）。
good_examples:
  - "注文を確定する / 本を追加 / 内容を確認する"
bad_examples:
  - "確認 / 設定 / 実行"
review_check: >-
  日本語のアクションラベルが動作を一意に示す動詞句になっており、名詞単独で
  複数の解釈が生じる語を使っていないか？
related: [WRITE-001, DLG-001]
sources:
  - title: デジタル庁デザインシステム — コンポーネント
    url: https://design.digital.go.jp/dads/components/
    tier: B
  - title: Material Design 3 — Buttons guidelines
    url: https://m3.material.io/components/buttons/guidelines
    tier: A
    note: ラベルは簡潔（1〜3語）で、動作を示す。
last_verified: 2026-08-08
```
