# CLAUDE.md

個人開発用のベースリポジトリ。**AI Coding 前提の品質ゲート**が中核で、規約はできる限り
機械化してある。ここには「ゲートが鳴る前に知っておくべきこと」だけを書く。

**詳細を再掲しないこと。** このリポジトリは単一情報源を思想にしている。仕様や理由は
[README.md](README.md) と [docs/adr/](docs/adr/) が持つ。このファイルは索引と禁止事項に徹する。

## 前提

- ドキュメント・コメント・コミットメッセージはすべて**日本語**で書く
- Bun + Turborepo の monorepo。`apps/{web,api}` / `packages/{contract,domain,db}` / `scripts/`
- **品質ゲートの本体は `@seri/base-tooling`**（別リポジトリ・git 依存・SHA 固定）。
  このリポジトリに残っているのは「リポジトリの形を知っている検査」だけ（ADR 0010）
- Cloudflare Workers + D1。API は oRPC の contract-first

## 守る境界

lint や型で落ちるものばかりだが、落ちてから直すと手戻りが大きい。

- **依存の向きは `contract → domain → db → api → web` の一方向。** 逆流とサブパス import は
  oxlint の `no-restricted-imports` が遮断する。`apps/web` は `apps/api` に依存しない
- **`packages/domain` で `Date.now` / `Math.random` / `crypto.randomUUID` を使わない。** 引数で受ける
- **Workers で `process.env` を読まない。** バインディングを使う
- **`any` 系は error。** `no-explicit-any` / `no-unsafe-*` / `no-unsafe-type-assertion` / `ban-ts-comment`
- **新しい oRPC 手続きは `os`（認証済みビルダー）から実装する。** 通さないと `context.userId` が
  無くコンパイルできない。リポジトリ層のクエリはセッションのユーザーでスコープし、
  他人のリソースは存在を漏らさないため `NOT_FOUND` を返す
- **しきい値は `@seri/base-tooling` の `QUALITY_GATES` が単一情報源。** 外部設定
  （`stryker.config.json` / `.jscpd.json`）にも書く数値は両方直す
  （片方だけだと適応度関数 `threshold drift` が落ちる）
- **lint のルール本体は `@seri/base-tooling` の base 設定にある。** ルートの
  `.oxlintrc.json` はそれを `extends` する薄いラッパで、層の依存方向と適用範囲だけを持つ
  （ADR 0010）。`ignorePatterns` は extends で継承されないのでルートに書く
- **`@seri/base-tooling` を import するスクリプトは `bun` で実行する。** Node は
  `node_modules` 配下の `.ts` を型除去できない。`vitest.config.ts` だけは Node が読むので、
  しきい値を JSON で引く（`vitest.shared.ts` にまとめてある）
- **A 層を直したくなったら `seri-base-tooling` を直して SHA を上げる。** このリポジトリで
  検査の枠組みを書き足さない
- **公開 API を破壊的に変えるときはコミットで宣言する**（`!` か `BREAKING CHANGE:`）。
  破壊的なマイグレーションは SQL ファイルに `-- destructive: <理由>` を書く。
  どちらも宣言が無いと ⑯ ⑰ が FAIL する
- **ゲートに詰まったら設定を緩めるのではなく実装を直す。** 適応度関数 ⑪ が lint 設定の
  改ざん（`"correctness": "off"` など）を検出する

## 変更したら走らせるもの

| 変えたもの                  | 走らせるもの                                                                     |
| --------------------------- | -------------------------------------------------------------------------------- |
| `packages/contract` の契約  | `bun run openapi:generate`（`docs/openapi.json` もコミット。忘れると ⑫ が FAIL） |
| `packages/db/src/schema.ts` | `bun run --filter @seri/db db:generate`（忘れると ⑩ が FAIL）                    |
| push する前                 | `bun run fitness`（pre-push でも走るが、詰まる前に手で回す）                     |
| 実装が一段落した            | `bun run review:plan` → `/quality-review`                                        |
| `scripts/` を触った         | `bun run test:scripts`                                                           |

主要な変更のあとは `bun run lint`（型情報つき）と `bun run typecheck` も通す。

## 検証（Maker–Checker）

実装した本人が合否を決めない。過去に「8 つのゲートが全く鳴らなかった」（ADR 0005）、
「ゲートが 2 件黙って緑だった」（ADR 0002）が実際に起きている。

- **決定論的ゲートの結果だけを「通った」の根拠にする。** 実際の終了コードと出力を見ずに
  「テストは通りました」と書かない
- **実装が一段落したら `/quality-review` を回す。** 変更内容から起動すべき観点を
  `bun run review:plan` が決め、観点ごとに独立したサブエージェントで見る。
  観点を 1 つのコンテキストで混ぜると見落とす。決定論的に検出できるものは
  ゲートに任せ、二重にやらない
- **起動する観点を自分で間引かない。** 判定は `scripts/review/route.ts` の純関数。
  間引くと「実施済み・指摘なし」になり、それを検出する手段が無い
- 組み込みの `/code-review` は観点を渡せない（対象と effort だけ）ので、
  バグ検出の 1 本として**併用**する。置き換えない
- **同じ失敗を 3 回繰り返したら止めて相談する。** ゲートを緩める・テストを消す・
  `// @ts-expect-error` を足すで通そうとしない
- **判断は ADR に残す。** しきい値の変更、ゲートの追加・削除、層の依存の変更、
  レビューで見つかった穴は、実装と同じコミット群に含める

## 手順が決まっているもの

- API 手続きの追加 → `/add-procedure`
- 適応度関数の追加 → `/add-fitness-check`
- 実装後の品質レビュー → `/quality-review`

## 参照

- [README.md](README.md) — コマンド一覧、品質ゲート ①〜⑬ の表、サプライチェーン対策、Git フック
- [docs/adr/0001-infrastructure-and-monorepo.md](docs/adr/0001-infrastructure-and-monorepo.md) — インフラとモノレポ構成
- [docs/adr/0002-fitness-functions.md](docs/adr/0002-fitness-functions.md) — 適応度関数とグッドハート対策
- [docs/adr/0003-supply-chain.md](docs/adr/0003-supply-chain.md) — サプライチェーン対策
- [docs/adr/0004-orpc-contract-first.md](docs/adr/0004-orpc-contract-first.md) — oRPC contract-first
- [docs/adr/0005-authorization-and-cors.md](docs/adr/0005-authorization-and-cors.md) — 認可と CORS
- [docs/adr/0006-openapi-generation.md](docs/adr/0006-openapi-generation.md) — OpenAPI の生成と乖離ゲート
- [docs/adr/0007-ai-coding-context.md](docs/adr/0007-ai-coding-context.md) — この文書とスキルを置いた理由、入れなかったもの
- [docs/adr/0008-stricter-lint.md](docs/adr/0008-stricter-lint.md) — AI Coding 向けの Lint 強化と、個別採用にした理由
- [docs/adr/0009-iso25010-review-layer.md](docs/adr/0009-iso25010-review-layer.md) — ISO/IEC 25010 の使い方とレビュー層
- [docs/quality/iso25010.md](docs/quality/iso25010.md) — レビュー観点（ゲートが見ないものだけ）

未着手（意図的に後回し）にしているものは README の「未着手」節にある。着手する前に読むこと。
