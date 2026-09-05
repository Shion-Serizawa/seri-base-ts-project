# seri-base-ts-project

個人開発用のベースリポジトリ。Cloudflare 無料枠で完結する構成に、**AI Coding 前提の品質ゲート**と
**サプライチェーン対策**を最初から組み込んである。

## 構成

```
apps/
  web/          Vite + React + TanStack Router (SPA) → Workers Static Assets
  api/          Hono Worker（oRPC / D1 / better-auth）
packages/
  contract/     oRPC の API 契約と zod スキーマ（最下層。他に依存しない）
  domain/       純粋なビジネスロジック（I/O なし）
  db/           Drizzle スキーマとマイグレーション
tooling/
  tsconfig/       共有 tsconfig プリセット
  vitest-config/  共有 Vitest 設定
  quality-gates/  適応度関数のしきい値の単一情報源
scripts/
  fitness/      適応度関数の計測（実装自体もテスト対象）
  mutation/     変更ファイルのみのミューテーションテスト
  openapi/      契約から OpenAPI ドキュメントを生成
  git/          Conventional Commits 検査
  hooks/        Claude Code のフック（未コミット検出・再生成の案内）
docs/
  openapi.json  生成物。契約との乖離を適応度関数 ⑫ が検出する
CLAUDE.md       AI に渡す索引と禁止事項（参照切れを適応度関数 ⑬ が検出する）
.claude/        permissions・フック定義・スキル
```

依存の向きは `contract → domain → db → api → web` の一方向。
API は **oRPC の contract-first** で、`apps/web` は `packages/contract` の契約からのみ型を得る
（`apps/api` への依存は無い）。境界は oxlint の `no-restricted-imports` で強制している。

- サーバ: `implement(apiContract)` → `RPCHandler` を Hono の `/api/rpc/*` にマウント
- クライアント: `createORPCClient(RPCLink)` + `@orpc/tanstack-query`

Hono は HTTP レイヤ（CORS・better-auth の委譲・ヘルスチェック）専用。
詳細は [docs/adr/0004-orpc-contract-first.md](docs/adr/0004-orpc-contract-first.md)。

## セットアップ

```bash
mise install                 # node / bun / gitleaks を mise.lock のチェックサム付きで導入
bun install                  # lefthook のフック登録と wrangler types 生成まで自動で走る
cp apps/api/.dev.vars.example apps/api/.dev.vars   # BETTER_AUTH_SECRET を設定

# D1 を作成し、出力された database_id を apps/api/wrangler.jsonc に反映
bunx wrangler d1 create seri-base-db
bun run --filter @seri/db db:migrate:local

bun run dev
```

## コマンド

| コマンド                          | 内容                                              |
| --------------------------------- | ------------------------------------------------- |
| `bun run dev`                     | 全アプリの開発サーバ（turbo）                     |
| `bun run build`                   | ビルド                                            |
| `bun run lint`                    | oxlint（**型情報つき**。tsgolint 経由）           |
| `bun run lint:quick`              | oxlint（型情報なし。pre-commit 用）               |
| `bun run format` / `format:check` | oxfmt                                             |
| `bun run typecheck`               | tsc --noEmit（TypeScript 7 ネイティブ）           |
| `bun run test` / `test:coverage`  | Vitest（api は miniflare 上の実 D1 で統合テスト） |
| `bun run test:scripts`            | 適応度関数の実装（`scripts/`）のテストのみ        |
| `bun run openapi:generate`        | 契約から `docs/openapi.json` を生成               |
| `bun run fitness`                 | 適応度関数の一括計測                              |
| `bun run fitness:deps`            | サプライチェーンのみ高速検証                      |
| `bun run mutation`                | 変更ファイルのミューテーションテスト              |
| `bun run deps:audit`              | `bun audit`                                       |

## 品質ゲート

しきい値は [`tooling/quality-gates/src/index.ts`](tooling/quality-gates/src/index.ts) に集約してある。
oxlint / stryker / jscpd の設定ファイル側の数値と食い違っていないことを、
`tooling/quality-gates` のテストが検証している（設定だけ緩めて指標を骨抜きにする抜け道を塞ぐ）。

指標は「単独でハックすると別の指標が悪化する」ように選んでいる。詳細は
[docs/adr/0002-fitness-functions.md](docs/adr/0002-fitness-functions.md)。

| #   | 指標                                                | 強制場所                                     | ハック手段                            | 牽制する指標                         |
| --- | --------------------------------------------------- | -------------------------------------------- | ------------------------------------- | ------------------------------------ |
| ①   | カバレッジ 80%（行/分岐/関数/文、**ファイル単位**） | Vitest                                       | アサーションなしテスト                | ④ + `vitest/expect-expect`           |
| ②   | test ratio **上限のみ** 2.50（ワークスペース単位）  | `bun run fitness`                            | —                                     | 「量を増やす」方向への牽制（③ と対） |
| ③   | 重複率 3% 以下                                      | jscpd                                        | 過度な共通化                          | ⑤                                    |
| ④   | ミューテーションスコア 60% 以上                     | CI（PR と main への push、変更ファイルのみ） | —                                     | ① と対                               |
| ⑤   | 循環的複雑度 10 / ネスト 3 / 関数 50 行 / 引数 4    | oxlint                                       | 無意味な関数分割                      | ⑥ ③                                  |
| ⑥   | 未使用 export・未使用依存ゼロ                       | knip                                         | **テストを1本足して「使用中」にする** | ⑥′                                   |
| ⑥′  | 本番の入口から到達しない export ゼロ                | `knip --production`                          | —                                     | ⑥ の抜け道を塞ぐ                     |
| ⑦   | 層をまたぐ依存・循環依存ゼロ（サブパス込み）        | oxlint                                       | —                                     | —                                    |
| ⑧   | バンドルサイズ（gzip: api 550kB / web 160kB）       | `bun run fitness`                            | 依存を足して楽をする                  | ⑤                                    |
| ⑨   | シークレットの混入ゼロ（作業ツリー + git 履歴）     | gitleaks                                     | —                                     | —                                    |
| ⑩   | スキーマとマイグレーションの乖離ゼロ                | drizzle-kit                                  | —                                     | —                                    |
| ⑪   | **Lint 設定そのものの改ざんゼロ**                   | `tooling/quality-gates` のテスト             | ゲートに詰まったら設定を緩める        | ⑪ が全指標を守る                     |
| ⑫   | 契約と OpenAPI ドキュメントの乖離ゼロ               | `bun run fitness`                            | —                                     | —                                    |
| ⑬   | `CLAUDE.md` とスキルの参照切れゼロ                  | `bun run fitness`                            | **文書ごと消す**                      | ⑬ が「文書なし」を FAIL にする       |

⑪ は他のすべての指標の前提です。カテゴリの severity、error にしているルールの集合、
off にしているルールの集合、override で無効化しているルールを
`tooling/quality-gates/src/lint-policy.ts` のポリシーと突き合わせ、
**`"correctness": "off"` や `"vitest/expect-expect": "off"` のような改ざんを検出**します。

**test ratio に下限を置いていないのは意図的です。** 下限は `it.each` のようなテーブル駆動化
（テスト行数が減ってカバレッジとミューテーションスコアは上がる書き方）を罰してしまい、
「量を足す」方向の圧力になります。テストが足りない側は ① の**ファイル単位**カバレッジと
④ ミューテーションスコアの方が正確に検出できます。

型そのものの退化（branded type を外す、入力型を広げる等）は
`packages/contract/src/*.test-d.ts` の型テスト（`vitest --typecheck`）で止めています。

決定的でない処理（`Date.now` / `Math.random` / `crypto.randomUUID`）は `packages/domain` では
禁止しています（時刻や乱数は引数で受け取る）。Workers で `process.env` を読むことも禁止です
（バインディングを使う）。

`any` の混入は「割合」ではなく **error** で禁止している（`typescript/no-unsafe-*`、
`no-explicit-any`、`no-unsafe-type-assertion`、`ban-ts-comment`）。

**適応度関数の実装（`scripts/`）自体もテスト対象です。** ここのバグは
「ゲートが黙って緑になる」形で現れ、型検査でも他のテストでも捕まりません
（実際に過去 2 件のゲートがこれで機能していませんでした）。
各検査は `FitnessContext`（`root` / `run` / `ci`）を引数で受け取るので、
テストは一時ディレクトリに作った擬似リポジトリと差し替えたコマンド実行に対して走ります
（knip も gitleaks も起動しません）。`bun run test:scripts` で単体実行できます。

⑬ は AI に読ませる文書（`CLAUDE.md` と `.claude/skills/**/SKILL.md`）が参照している
ファイルと `bun run` のスクリプトが実在することを検査します。ここが古くなる壊れ方は
誰にも見えません。AI は存在しないパスを黙って諦め、存在しないコマンドを打って別の理由で
失敗するので、原因が文書の陳腐化だと気づけないためです。

## API ドキュメント（OpenAPI）

`docs/openapi.json` を `packages/contract` の契約から生成しています。実装ではなく契約から
生成するので、ドキュメント専用のアノテーションが要らず、契約と食い違うこともありません。
zod の制約（`title` の 1〜200 文字）、branded type の `TodoId`（`format: uuid`）、
契約で宣言した型付きエラー（`UNAUTHORIZED` / `NOT_FOUND` / `BLANK_TITLE`）まで載ります。

```bash
bun run openapi:generate   # 契約を変えたら実行してコミットする
```

生成物はコミットします（契約変更が破壊的変更かどうかをレビューで差分として見るため）。
契約との乖離は適応度関数 ⑫ が検出します。生成器は Worker には載せていません
（バンドルサイズ予算をドキュメントのために使わないため）。
詳細は [docs/adr/0006-openapi-generation.md](docs/adr/0006-openapi-generation.md)。

## フォーマッタ

**oxfmt**（`.oxfmtrc.json`）を使っています。oxlint と同じ oxc ベースなので二重管理になりません。

- 設定は**すべて明示**しています（`printWidth` / `singleQuote` / `trailingComma` / `endOfLine: "lf"` など）。
  oxfmt は 0.x なので既定値が変わる可能性があり、暗黙の既定値に依存すると
  バージョン更新で差分が発生するためです。依存は完全固定なので更新は意図的な操作になります
- `sortImports` と `sortPackageJson` を有効にしています。import 順が決定的になるので、
  AI が生成した差分がレビューしやすくなります。import 順の lint ルール（`sort-imports`）は
  フォーマッタと二重管理になるため無効にしています
- 対象は `.ts` / `.tsx` / `.js` / `.mjs` / `.json` / `.jsonc` / `.md`
- 強制場所: pre-commit（差分のみ・`stage_fixed: true` で自動修正を staging に戻す）と
  CI の `bun run format:check`
- エディタ: `.vscode/settings.json` で保存時フォーマットを oxc に向けています

```bash
bun run format        # 書き換える
bun run format:check  # 差分があれば失敗する（CI と同じ）
```

## セキュリティ

参照実装（Todo）は**認可込み**です。詳細は
[docs/adr/0005-authorization-and-cors.md](docs/adr/0005-authorization-and-cors.md)。

- `todos` は `userId` を必須で持ち、リポジトリ層のクエリはすべてセッションのユーザーでスコープする
- 認証ミドルウェアを通さない手続きは `context.userId` を持たないため**コンパイルできない**
- 他人のリソースへの操作は存在を漏らさないため `NOT_FOUND` を返す
- CORS はオリジンを反射せず、`ALLOWED_ORIGINS`（バインディング）の許可リストで判定する

新しい手続きを足すときは `os`（認証済みビルダー）から実装してください。

## Git フック

| フック     | 内容                                                                                   | 目安     |
| ---------- | -------------------------------------------------------------------------------------- | -------- |
| pre-commit | 差分の oxfmt + oxlint（型情報なし）、`package.json` 等を触ったらサプライチェーン検証   | 1 秒未満 |
| commit-msg | Conventional Commits 形式                                                              | 即時     |
| pre-push   | 型情報つき lint / 型検査 / 全テスト+カバレッジ（`scripts/` 込み）/ ビルド / 適応度関数 | 数十秒   |

## サプライチェーン対策

詳細は [docs/adr/0003-supply-chain.md](docs/adr/0003-supply-chain.md)。

- **完全固定**: `bunfig.toml` の `exact = true`。レンジ指定が残っていないことを適応度関数が検査する
- **公開遅延**: `minimumReleaseAge = 604800`（7 日）。汚染されたリリースが検知・取り下げされる時間を稼ぐ
- **integrity**: `bun.lock` を commit し、CI は `--frozen-lockfile`
- **ツールチェーン固定**: `mise.lock` に全プラットフォーム分の SHA256
- **postinstall 無効**: Bun は依存パッケージのライフサイクルスクリプトを既定で実行しない（`trustedDependencies` は空）
- **GitHub Actions**: すべて 40 桁のコミット SHA で固定（可変タグ禁止）。適応度関数が検査する
- **audit**: CI は `bun audit --audit-level=high` で失敗させる
- **シークレット検査**: gitleaks（mise 管理・`mise.lock` で固定）で作業ツリーと git 履歴を走査。
  `bun run fitness` に含まれるため pre-push でも走る

> `bun audit` は pre-push には入れていません。フックのシェルから `bun` が引けない環境があるためで、
> CI 側のゲートに寄せています。

緊急のセキュリティ修正を遅延を無視して取り込む場合のみ:

```bash
bun add <pkg> --minimum-release-age=0
```

## 未着手（意図的に後回し）

- E2E（Playwright）: 現在ルーティングの結線（`apps/web/src/routes/**`）だけがテスト対象外
- MCP サーバ（今つなぐ先が無いため。`CLAUDE.md` とスキルは
  [docs/adr/0007-ai-coding-context.md](docs/adr/0007-ai-coding-context.md) で導入済み）
- 認証 UI（サインイン・サインアップ画面）。API と認証クライアントの結線までは完了している
- `packages/db` と `tooling/vitest-config` の直接のテスト（振る舞いは api の統合テストと
  各パッケージの利用側で検証している。`bun run fitness` のワークスペース別表示で可視化される）
- REST 形式の API 公開（契約に `.route()` を足して `OpenAPIHandler` をマウントすれば可能）
