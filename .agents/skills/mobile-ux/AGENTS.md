# AGENTS.md — Mobile UX Skill

このリポジトリは AI Coding Agent 向けの Mobile UX/UI Skill（知識ベース + ワークフロー）である。

## モバイルUIを設計・実装・レビューするとき

**必ず `SKILL.md` を読み、そのワークフローに従うこと。** 要点:

- 見た目やコードから作り始めず、ユーザー目的 → タスク → フロー → 画面 の順で設計する
- 画面ごとに UI 状態（loading / empty / error / offline 等）の要否を明示的に判定する
- 実装前に `process/review.md` のレビューゲート（critical 0 / high 0 / rubric ≥ 80）を通す
- ルールの索引は `rules/INDEX.md`、個別ルールはカテゴリ別ファイルの YAML ブロック

## このリポジトリ自体を編集するとき

- ルールの形式は `docs/rule-format.md` に従う。出典のない規範を追加しない
- 編集後は `python3 scripts/validate_rules.py --index` を実行し、検証を通し INDEX を再生成する
- 設計変更は `docs/design-decisions.md` に理由を追記する
