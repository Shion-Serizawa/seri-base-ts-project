# 0001. インフラとモノレポ構成

- 日付: 2026-08-23
- 状態: 採用

## 背景

個人開発のベースリポジトリ。制約は次の 3 つ。

1. なるべくコストがかからない（無料枠で完結する）
2. AI Coding 前提でコード品質を高く保てる
3. 品質指標がグッドハートの法則でハックされない

## 決定

| 領域                 | 採用                                  | 却下した案と理由                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 実行基盤             | Cloudflare Workers + D1               | 無料枠で完結。Binding で `.env` が減る                                                                                                                                                                                              |
| フロント             | Vite + React + TanStack Router（SPA） | TanStack Start（SSR）は破壊的変更が多く、フロント／サーバが同一 Worker に同居して層の境界がコード規約頼りになる。SPA + API 分離なら境界が物理的に分かれ、複雑度・依存の計測単位が明確になる                                         |
| API 型安全           | Hono RPC（`hc`）                      | oRPC は追加依存と型推論コストが増える。型推論がボトルネックになってから移行する                                                                                                                                                     |
| デプロイ             | wrangler のみ                         | Alchemy の売り（miniflare 起動・docker 不要）は `wrangler dev` でも得られる。Alchemy 固有の価値はプレビュー環境の量産で、個人開発では抽象が 1 層増える方が高コスト。AI にとってもドキュメント量の多い wrangler の方が生成精度が高い |
| DB / ORM             | D1 + Drizzle                          | 無料枠。大規模化したら Neon/Supabase + Hyperdrive に移すが、その時は方言の書き換えが発生することを承知の上                                                                                                                          |
| 認証                 | better-auth                           | セルフホスト無料。Drizzle アダプタあり                                                                                                                                                                                              |
| パッケージマネージャ | Bun                                   | install / script 実行が最速。`--minimum-release-age` を標準搭載しており、依存パッケージの postinstall を既定で実行しないのがサプライチェーン上有利                                                                                  |
| ツールチェーン管理   | mise（`mise.lock`）                   | ツール自体のチェックサムを全プラットフォーム分固定できる                                                                                                                                                                            |
| タスクランナー       | Turborepo                             | 無料。差分実行。GitHub Actions cache でリモートキャッシュ相当を自作できる                                                                                                                                                           |
| Lint / Format        | oxlint（+ tsgolint）+ oxfmt           | Biome より型情報を使えるルールが強い。循環的複雑度も oxlint 側で強制できる                                                                                                                                                          |
| Vite+                | 見送り                                | 商用・早期アクセス製品。ベースリポジトリの土台に置くと条件変更のリスクを負う                                                                                                                                                        |

## 依存の向き

`contract → domain → db → api → web` の一方向。`apps/web` は `apps/api` を型としてのみ参照する。
dependency-cruiser で表現する予定だったが後述の理由で使えないため、
oxlint の `no-restricted-imports`（`allowTypeImports`）+ `import/no-cycle` で強制している。

`apps/api/src/env.ts` の `Bindings` は、Workers のグローバル型（`Cloudflare.Env` / `D1Database`）
ではなく drizzle の `AnyD1Database` を使っている。`apps/web` が `AppType` を型解決するときに
このファイルも読まれるため、ブラウザ型環境でも壊れない型にしておく必要がある。
`wrangler types` が生成する `Cloudflare.Env` との整合は `apps/api/src/env-check.ts` が
型レベルで検証する（キーの網羅を検査する）。

## 検証で判明した非自明な事実

これらは採用判断そのものを変えた実測結果。

### TypeScript 7（Go 製ネイティブ版）はレガシー JS API を持たない

`typescript@7.0.2` には `ts.createProgram` / `ts.parseConfigFileTextToJson` が無い（`./unstable/*` のみ）。
結果として **TypeScript Compiler API に依存するツールが動かない**。

| ツール             | 状態                          | 対応                                                                                              |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`     | 動作（7 パッケージで約 3 秒） | 採用                                                                                              |
| type-coverage      | 動作不能                      | 採用しない。`typescript/no-unsafe-*` 系ルールで `any` を **error** として禁止する方が牽制力が強い |
| dependency-cruiser | 走査 0 件で実質無効           | 採用しない。層の境界は oxlint の `no-restricted-imports` で表現                                   |
| Stryker            | tsconfig 前処理で例外         | `ignorePatterns: ["**/tsconfig.json"]` でサンドボックスに tsconfig を入れないことで回避           |

### workerd は v8 の Profiler セッションを実装していない

`@cloudflare/vitest-pool-workers` 上で v8 カバレッジを取ると
`The Session method is not implemented` で失敗する。`apps/api` だけ
コード計装方式の `istanbul` プロバイダに切り替えている。

### `@cloudflare/vitest-pool-workers` は Vitest 4 で API が変わった

`defineWorkersConfig` / `./config` サブパスは無くなり、`cloudflareTest()` を
Vite プラグインとして渡す形になった。`env` も
`cloudflare:test` からではなく `cloudflare:workers` から取るのが新方式
（`cloudflare:test` の `env` は deprecated）。

### Stryker のプラグイン自動探索が Bun の node_modules レイアウトで機能しない

`node_modules/@stryker-mutator/*` の glob 探索が Bun のシンボリックリンク構成で
プラグインを見つけられない。`plugins: ["@stryker-mutator/vitest-runner"]` と
明示すれば動作する。また各パッケージの cwd で実行する必要がある（リポジトリ root から
実行すると vitest がテストを見つけられない）。

## 影響

- `type-coverage` と `dependency-cruiser` を使わない代わりに、oxlint の役割が大きい。
  oxlint のバージョンは `bunfig.toml` の `exact = true` で完全固定してあるため、
  ルール追加が突然 CI を壊すことはない
- TypeScript を 6.x 系に落とせば上記ツールは全て使えるようになる。
  型検査速度と引き換えなので、ツールが必要になった時点で再検討する
