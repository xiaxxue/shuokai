---
name: mobile-ux
description: >-
  Mobile app UX/UI design and review skill. Use when designing, implementing,
  or reviewing any mobile app UI (iOS, Android, Flutter, React Native,
  Kotlin/Swift, mobile web app shells) — new apps, new screens, UI changes, or
  UX reviews. Enforces goal-first design, platform conventions, UI state
  coverage, accessibility, and UX writing, with a rule-based review gate.
---

# Mobile UX Skill

モバイルアプリのUI設計・実装・レビューを、ユーザー目的起点で行い、ルールベースのレビューゲートを通過させるための Skill。目標は「専門デザイナーの100点」ではなく「AIだけで安定して80点」。

## 絶対原則

1. **見た目から作り始めない。** 要求 → ユーザー目的 → タスク → フロー → 画面 の順で設計する。画面やコードの生成はこの順序の後。
2. **通常状態だけの画面を作らない。** 各画面で loading / empty / error / offline / success / disabled / permission-denied の要否を明示的に判定する（`rules/states/ui-states.md`）。
3. **アクセシビリティと文言は後付けにしない。** touch target・コントラスト・ラベルは設計段階の成果物に含める。
4. **プラットフォーム慣習に従う。** iOS / Android で同一UIを強制しない（`rules/platform/`）。
5. **実装前にレビューゲートを通す。** critical 違反 0・high 違反 0（または明文の例外理由）・rubric 80点以上（`process/review.md`）。

## タスク規模の判定（最初に必ず行う）

| Tier | 対象 | 必須工程 |
|------|------|---------|
| **T1** | 新規アプリ / 複数画面の新機能 | 下記ワークフロー全工程 + UX Design Doc（`docs/templates/ux-design-doc.md`）+ フルレビュー |
| **T2** | 単一画面・単一フローの追加/変更 | 目的確認 → 該当カテゴリのルール参照 → 状態設計 → 該当ルールのみでレビュー |
| **T3** | 小修正（文言・色・単一コンポーネント） | 変更に関係するカテゴリの review_check のみ実行（レビューをゼロにはしない） |

## ワークフロー（T1）

各ステップで参照するファイルを示す。ルールは `rules/INDEX.md` で索引し、必要なカテゴリファイルだけを読む。

1. **ユーザーとゴールの特定** — 誰が・何を達成したいか・成功条件。 → `rules/foundations/core-principles.md`
2. **タスク分解** — primary / secondary タスクを列挙し優先順位を付ける。
3. **プラットフォーム決定** — iOS / Android / 両方。両方なら差分方針も決める。 → `rules/platform/`
4. **情報アーキテクチャ** — タスクから画面候補と情報の階層を導く。
5. **ユーザーフロー** — 主要タスクごとに開始→完了の画面遷移を書く。戻る操作を必ず定義。 → `rules/navigation/navigation.md`
6. **画面構造とナビゲーション** — タブ/スタック/モーダルの選択。 → `rules/navigation/`, `patterns/`
7. **UI状態設計** — 全画面 × 状態マトリクスを作る。 → `rules/states/ui-states.md`
8. **コンポーネント選択** — プラットフォーム標準を優先。 → `rules/components/`
9. **UX Writing** — 画面内の全文言（ボタン・エラー・空状態）を書く。日本語アプリは日本語規範も適用。 → `rules/content/`
10. **アクセシビリティ** — touch target・コントラスト・ラベル・Dynamic Type/文字拡大・フォーカス順。 → `rules/accessibility/`, `rules/layout/`
11. **ビジュアル階層** — 優先タスクが視覚的に最優先か確認。 → `rules/layout/`
12. **セルフレビュー** — `process/review.md` の手順でチェックリスト → rubric → 判定。
13. **修正と再レビュー** — critical/high を修正し、ゲート通過まで反復。
14. **実装** — ゲート通過後にのみコードを書く。実装後、T2相当のレビューをコードに対して再実行。

## 見落とされやすい領域（設計の最後に必ず確認する）

v0.1 の A/B 評価で、本 Skill を適用した設計でも脱落した領域。ワークフローの最後にこの3点を明示的に確認する。

1. **セーフエリアとインセット**（SPACE-001, AND-002） — Android 15+ では edge-to-edge が回避不能。FAB・下部固定ボタン・スクロール末尾がシステムUIに隠れないか
2. **スクリーンリーダーの読み上げ順序**（A11Y-003） — 上部に検索、下部にFAB、中央にリストという構成は視覚順と読み上げ順がずれやすい
3. **日本語入力の正規化**（JA-003） — 全角/半角・ハイフン有無をエラーで弾いていないか。検索のゼロ件要因として頻出

## ルールの読み方

- `rules/INDEX.md` — 全ルールの索引（id / severity / title / file）。まずここを見る。
- 各ルールの `review_check` は Yes = 準拠 の検査質問。レビューはこの質問への回答で行う。
- `severity`: critical/high は交渉不可。medium は原則従う。low/suggestion は文脈次第。定義は `process/severity.md`。
- `stability: current` のルールは最新OSの挙動に依存する。疑わしければ `last_verified` と出典URLを確認する。
- ルールが衝突する場合、より高い severity → より具体的な条件を持つルール → platform 固有ルール、の順に優先する。

## レビュー（実行手順は process/review.md）

1. 対象画面/変更に適用されるルールを INDEX から選定する。**検査は severity で段階化する** — critical/high（51件）は T1 で全件、medium 以下は対象領域のみ（全件の回答表は作らない）
2. 各ルールの review_check に Yes / No / N/A で回答し、No には根拠（該当箇所）を付ける。設計に記述がないものを Yes にしない
3. Yes と答えた critical/high について**反証パス**を実行する（`process/review.md` §2.5）。実測が必要な項目は Yes ではなく「未検証」として残す
4. No を severity 別に集計し、rubric（`process/review.md`）を採点する
5. 合格 = critical 0 かつ high 0（または明文の例外理由）かつ rubric ≥ 80。不合格なら severity 順に修正して再レビュー

**自己レビューの PASS は合否判定として使えない。** 実測では自己レビューと独立レビューの判定が毎回乖離している（100→85、96→93、93→72、92→61）。自己レビューは明白な違反の絞り込みまでとし、**T1（新規アプリ）および外部に出す成果物では、独立したセッションによるレビューを必ず行う**（`eval/results/REPORT.md`）。

## パターンとアンチパターン

- タスク単位の組み立て方（認証・権限要求・破壊的操作・検索・オンボーディング・設定・CRUD）: `patterns/`
- AIが生成しがちな失敗UIの検出と修正: `anti-patterns/ai-generated-ui.md` — 設計後・実装後に一読して自己検査する
