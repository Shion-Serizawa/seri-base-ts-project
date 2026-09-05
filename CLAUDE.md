# CLAUDE.md

個人開発用のベースリポジトリ。**AI Coding 前提の品質ゲート**が中核で、規約はできる限り
機械化してある。ここには「ゲートが鳴る前に知っておくべきこと」だけを書く。

**詳細を再掲しないこと。** このリポジトリは単一情報源を思想にしている。仕様や理由は
[README.md](README.md) と [docs/adr/](docs/adr/) が持つ。このファイルは索引と禁止事項に徹する。

## 前提

- ドキュメント・コメント・コミットメッセージはすべて**日本語**で書く
- Bun + Turborepo の monorepo。`apps/{web,api}` / `packages/{contract,domain,db}` / `tooling/*` / `scripts/`
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
- **しきい値は `tooling/quality-gates/src/index.ts` が単一情報源。** 外部設定
  （`.oxlintrc.json` / `stryker.config.json` / `.jscpd.json`）にも書く数値は両方直す
  （片方だけだと `tooling/quality-gates` のテストが落ちる）
- **ゲートに詰まったら設定を緩めるのではなく実装を直す。** 適応度関数 ⑪ が lint 設定の
  改ざん（`"correctness": "off"` など）を検出する

## 変更したら走らせるもの

| 変えたもの                  | 走らせるもの                                                                     |
| --------------------------- | -------------------------------------------------------------------------------- |
| `packages/contract` の契約  | `bun run openapi:generate`（`docs/openapi.json` もコミット。忘れると ⑫ が FAIL） |
| `packages/db/src/schema.ts` | `bun run --filter @seri/db db:generate`（忘れると ⑩ が FAIL）                    |
| push する前                 | `bun run fitness`（pre-push でも走るが、詰まる前に手で回す）                     |
| `scripts/` を触った         | `bun run test:scripts`                                                           |

主要な変更のあとは `bun run lint`（型情報つき）と `bun run typecheck` も通す。

## 検証（Maker–Checker）

実装した本人が合否を決めない。過去に「8 つのゲートが全く鳴らなかった」（ADR 0005）、
「ゲートが 2 件黙って緑だった」（ADR 0002）が実際に起きている。

- **決定論的ゲートの結果だけを「通った」の根拠にする。** 実際の終了コードと出力を見ずに
  「テストは通りました」と書かない
- **実装が一段落したら `/code-review` を独立したコンテキストで回す**（環境側のプラグイン依存。
  リポジトリには実体が無い）。 見るのは
  「仕様との一致」「ADR の判断に反していないか」「ゲートが鳴らない種類の劣化」。
  決定論的に検出できるものはゲートに任せ、二重にやらない
- **同じ失敗を 3 回繰り返したら止めて相談する。** ゲートを緩める・テストを消す・
  `// @ts-expect-error` を足すで通そうとしない
- **判断は ADR に残す。** しきい値の変更、ゲートの追加・削除、層の依存の変更、
  レビューで見つかった穴は、実装と同じコミット群に含める

## 手順が決まっているもの

- API 手続きの追加 → `/add-procedure`
- 適応度関数の追加 → `/add-fitness-check`

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

未着手（意図的に後回し）にしているものは README の「未着手」節にある。着手する前に読むこと。
