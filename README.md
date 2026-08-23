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
  fitness/      適応度関数の計測
  mutation/      変更ファイルのみのミューテーションテスト
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
mise install                 # node / bun を mise.lock のチェックサム付きで導入
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

| #   | 指標                                             | 強制場所               | ハック手段             | 牽制する指標               |
| --- | ------------------------------------------------ | ---------------------- | ---------------------- | -------------------------- |
| ①   | カバレッジ 80%（行/分岐/関数/文）                | Vitest                 | アサーションなしテスト | ④ + `vitest/expect-expect` |
| ②   | test ratio 0.50〜2.50                            | `bun run fitness`      | テストのコピペ膨張     | ③（上限側で効く）          |
| ③   | 重複率 3% 以下                                   | jscpd                  | 過度な共通化           | ⑤                          |
| ④   | ミューテーションスコア 60% 以上                  | CI（変更ファイルのみ） | —                      | ① と対                     |
| ⑤   | 循環的複雑度 10 / ネスト 3 / 関数 50 行 / 引数 4 | oxlint                 | 無意味な関数分割       | ⑥ ③                        |
| ⑥   | 未使用 export・未使用依存ゼロ                    | knip                   | —                      | ⑤                          |
| ⑦   | 層をまたぐ依存・循環依存ゼロ                     | oxlint                 | —                      | —                          |
| ⑧   | バンドルサイズ（gzip: api 550kB / web 160kB）    | `bun run fitness`      | 依存を足して楽をする   | ⑤                          |

`any` の混入は「割合」ではなく **error** で禁止している（`typescript/no-unsafe-*`、
`no-explicit-any`、`no-unsafe-type-assertion`、`ban-ts-comment`）。

## Git フック

| フック     | 内容                                                                                 | 目安     |
| ---------- | ------------------------------------------------------------------------------------ | -------- |
| pre-commit | 差分の oxfmt + oxlint（型情報なし）、`package.json` 等を触ったらサプライチェーン検証 | 1 秒未満 |
| commit-msg | Conventional Commits 形式                                                            | 即時     |
| pre-push   | 型情報つき lint / 型検査 / 全テスト+カバレッジ / 適応度関数                          | 数十秒   |

## サプライチェーン対策

詳細は [docs/adr/0003-supply-chain.md](docs/adr/0003-supply-chain.md)。

- **完全固定**: `bunfig.toml` の `exact = true`。レンジ指定が残っていないことを適応度関数が検査する
- **公開遅延**: `minimumReleaseAge = 604800`（7 日）。汚染されたリリースが検知・取り下げされる時間を稼ぐ
- **integrity**: `bun.lock` を commit し、CI は `--frozen-lockfile`
- **ツールチェーン固定**: `mise.lock` に全プラットフォーム分の SHA256
- **postinstall 無効**: Bun は依存パッケージのライフサイクルスクリプトを既定で実行しない（`trustedDependencies` は空）
- **GitHub Actions**: すべて 40 桁のコミット SHA で固定（可変タグ禁止）。適応度関数が検査する
- **audit**: CI は `bun audit --audit-level=high` で失敗させる

緊急のセキュリティ修正を遅延を無視して取り込む場合のみ:

```bash
bun add <pkg> --minimum-release-age=0
```

## 未着手（意図的に後回し）

- E2E（Playwright）: 現在ルーティングの結線（`apps/web/src/routes/**`）だけがテスト対象外
- AI Coding 向けの環境整備（CLAUDE.md、スキル、MCP など）
- 認証 UI（サインイン・サインアップ画面）。API と認証クライアントの結線までは完了している
- OpenAPI ドキュメント生成（`@orpc/openapi` を足せば可能）
