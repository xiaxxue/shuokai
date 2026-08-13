# Mobile UX Skill

AI Coding Agent（Claude Code / Codex / その他 Markdown ベースの Skill を読めるエージェント）が、スマートフォンアプリを設計・実装・レビューするときに参照する **Mobile UX/UI Skill**。

目標は「専門デザイナーの100点」ではなく、**AIだけで安定して80点前後のUXを出せる仕組み**。UX資料集ではなく、エージェントが**参照・判断・レビューできる**構造化ルールとワークフローで構成する。

## 何を防ぐか

- 見た目・コードから作り始めて、ユーザー目的に合わない画面を量産する
- loading / empty / error / offline などの状態設計漏れ
- タッチターゲット不足・コントラスト不足などの基本的アクセシビリティ欠陥
- 「エラーが発生しました」「OK」のような無情報 UX Writing
- iOS / Android のプラットフォーム慣習からの逸脱
- レビューなしの実装（本 Skill は critical/high 違反 0 + rubric 80 点のゲートを強制する）

## 使い方

### Claude Code

```bash
git clone <this-repo> ~/.claude/skills/mobile-ux     # 全プロジェクトで使う場合
git clone <this-repo> .claude/skills/mobile-ux       # 特定プロジェクトのみ
```

`SKILL.md` の frontmatter（`name: mobile-ux`）により、次のセッションから利用可能スキルとして登録される。モバイルUIの設計・実装・レビューを依頼すると起動する。明示的に呼ぶ場合は `/mobile-ux`。

`eval/` と `.github/` は Skill の実行に不要なので、配置時に除いてよい。

### Codex / その他エージェント

リポジトリをプロジェクトに含め、プロジェクト直下の `AGENTS.md` に本リポジトリの `AGENTS.md` の内容を置く（`SKILL.md` へ委譲している）。パスがサブディレクトリになる場合は参照先を書き換える。

Codex CLI 0.147.0 で実測済み — Skill に一切言及しない要求文からでも、AGENTS.md 経由でワークフローとレビューゲートが起動する（`eval/results/agent-compatibility.md`）。

### 人間

`SKILL.md` → `rules/INDEX.md` → 各カテゴリファイル、の順に読む。レビューだけ使いたい場合は `process/review.md`。

## 構成

```text
SKILL.md            エージェントの入口（ワークフロー + 参照索引）
AGENTS.md           Codex等向けの委譲エントリ
rules/              構造化ルール（カテゴリ別Markdown内のYAMLブロック）
  INDEX.md          全ルール索引（自動生成）
  interaction/      ジェスチャー（システム競合）・ハプティクス
patterns/           タスク単位の設計パターン（認証・権限・検索・破壊的操作 等）
anti-patterns/      AIが生成しがちな失敗UIのカタログ
process/            レビュー手順・severity定義
schemas/            rule.schema.json（ルールの検証スキーマ）
sources/            出典ポリシーと一次情報調査ノート
eval/               Skill自体のA/B評価プロトコル
docs/               設計判断（ADR）・taxonomy・ルール書式・成果物テンプレート
scripts/            ルール検証・INDEX生成
```

## 開発

```bash
python3 scripts/validate_rules.py --index   # ルール検証 + INDEX再生成（要 PyYAML）
python3 scripts/check_staleness.py          # 出典の再確認期限をチェック
python3 scripts/check_links.py              # ドキュメント内のファイル参照が解決するか
```

CI（`.github/workflows/validate.yml`）が push / PR でスキーマ検証と INDEX の同期を検査し、毎週の定期実行で出典の陳腐化を報告する。再確認の期限は `stability` に応じて current 180日 / convention 365日 / core 730日。

ルールの追加・変更は `docs/rule-format.md` の規約に従う。出典（Tier A/B 優先）のない規範は追加しない。設計判断の経緯は `docs/design-decisions.md`。

## Status

**v0.2 進行中。** 131ルール（全件スキーマ検証済み）/ 9パターン / 16アンチパターン / レビューエンジン / A/B評価。

v0.1（101ルール）で構想の完成条件11項目を達成し、v0.2 で Backlog 領域（適応レイアウト・通知・ウィジェット・ジェスチャー・ハプティクス・リーチャビリティ）を追加した。

3アプリでの盲検A/B評価では、Skill適用時に critical+high 違反が 36→3、34→0、24→4 と全アプリで減少した。ただし3件中2件は独立レビューのゲートを通過しておらず、**現状は「安定して80点」に届いていない**。評価の詳細・測定手法の限界は `eval/results/REPORT.md`。

評価結果を受けて Skill を修正した（D-012〜D-015）。Claude Code / Codex の両方で、Skill に言及しない要求文から自動起動することを実測済み（`eval/results/agent-compatibility.md`）。

マイルストーン全11項目の達成状況と残件は `docs/v0.1-milestone.md`。

**重要な既知の限界**: 自己レビューは合否判定に使えない。実測で自己レビューと独立レビューの判定は毎回乖離している（100→85、96→93、93→72、92→61）。T1 と外部に出す成果物では独立セッションのレビューを行うこと。
