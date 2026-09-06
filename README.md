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
scripts/
  fitness/project/  このリポジトリの形に依存する適応度関数（契約・スキーマ・層）
  mutation/     変更ファイルのみのミューテーションテスト
  openapi/      契約から OpenAPI ドキュメントを生成
  git/          Conventional Commits 検査
  hooks/        Claude Code のフック（未コミット検出・再生成の案内）
  review/       変更内容からレビュー観点を決める決定論ルーター
docs/
  openapi.json  生成物。契約との乖離を適応度関数 ⑫ が検出する
  quality/      ISO/IEC 25010 のレビュー観点（ゲートが見ないものだけ）
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

## このテンプレートから新しいプロジェクトを作る

GitHub の **Use this template** から作る（fork ではない）。fork にすると Issue / PR / star が
親に紐づき、派生から親へ誤って PR が飛ぶ。テンプレートから作れば履歴の無い独立リポジトリに
なり、初期コミット 1 個から始まる。

作ったら 2 つやる。

1. `.seri-base.json` の `ref` を、コピー元のコミット SHA に書き換える。
   **これが基盤との唯一の接点**で、後から「どの世代から来たか」を知る手段はこれしか無い
2. `apps/` と `packages/` のサンプル（Todo）を作るものに置き換える

`@seri/base-tooling`（品質ゲートの本体）は依存として入っているので、基盤の改良は
**SHA を上げるだけ**で届く。届かないのは `CLAUDE.md` / `knip.json` / サンプル実装で、
これらは派生固有になるのが当然のものとして意図的に伝播させていない。
境界の理由は [docs/adr/0010-base-repo-derivation-and-propagation.md](docs/adr/0010-base-repo-derivation-and-propagation.md)。

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
| `bun run lint:fix`                | 型情報つき Lint と安全な自動修正                  |
| `bun run lint:quick`              | oxlint（型情報なし。pre-commit 用）               |
| `bun run format` / `format:check` | oxfmt                                             |
| `bun run typecheck`               | tsc --noEmit（TypeScript 7 ネイティブ）           |
| `bun run test` / `test:coverage`  | Vitest（api は miniflare 上の実 D1 で統合テスト） |
| `bun run test:scripts`            | 適応度関数の実装（`scripts/`）のテストのみ        |
| `bun run openapi:generate`        | 契約から `docs/openapi.json` を生成               |
| `bun run fitness`                 | 適応度関数の一括計測                              |
| `bun run review:plan`             | 変更内容から起動すべきレビュー観点を出す          |
| `bun run fitness:deps`            | サプライチェーンのみ高速検証                      |
| `bun run mutation`                | 変更ファイルのミューテーションテスト              |
| `bun run deps:audit`              | `bun audit`                                       |

## 品質ゲート

**ゲートの本体は [`@seri/base-tooling`](https://github.com/Shion-Serizawa/seri-base-tooling) にある。**
git 依存 + コミット SHA で固定して引いている。このリポジトリに残っているのは
「リポジトリの形（oRPC の契約・Drizzle のマイグレーション・層の依存方向）を知っている検査」だけで、
`scripts/fitness/project/` に置いてある。理由と境界は
[docs/adr/0010-base-repo-derivation-and-propagation.md](docs/adr/0010-base-repo-derivation-and-propagation.md)。

しきい値は `@seri/base-tooling` の `QUALITY_GATES` に集約してある。
oxlint / stryker / jscpd の設定ファイル側の数値と食い違っていないことを、適応度関数
`threshold drift` が検証している（設定だけ緩めて指標を骨抜きにする抜け道を塞ぐ）。

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
| ⑦   | 層をまたぐ依存・循環依存ゼロ（サブパス込み）        | oxlint                                       | 境界の定義そのものを書き換える        | ⑪ が定義との一致を見る               |
| ⑧   | バンドルサイズ（gzip: api 550kB / web 160kB）       | `bun run fitness`                            | 依存を足して楽をする                  | ⑤                                    |
| ⑨   | シークレットの混入ゼロ（作業ツリー + git 履歴）     | gitleaks                                     | —                                     | —                                    |
| ⑩   | スキーマとマイグレーションの乖離ゼロ                | drizzle-kit                                  | —                                     | —                                    |
| ⑪   | **Lint 設定そのものの改ざんゼロ**                   | `bun run fitness`                            | ゲートに詰まったら設定を緩める        | ⑪ が全指標を守る                     |
| ⑪′  | しきい値の二重管理の乖離ゼロ                        | `bun run fitness`                            | 設定ファイル側だけを緩める            | ⑪ と対（形と数値の両側）             |
| ⑪″  | 層と認可スコープの定義がポリシーと一致              | `bun run fitness`                            | allowlist に 1 行足す                 | ⑦ ⑭ の定義を固定する                 |
| ⑫   | 契約と OpenAPI ドキュメントの乖離ゼロ               | `bun run fitness`                            | —                                     | —                                    |
| ⑬   | `CLAUDE.md` とスキルの参照切れゼロ                  | `bun run fitness`                            | **文書ごと消す**                      | ⑬ が「文書なし」を FAIL にする       |
| ⑭   | 認可スコープをテーブル境界に閉じ込める              | oxlint（`no-restricted-imports`）＋ 型       | 境界の内側に絞り込まない操作を足す    | allowlist の拡大は ⑪ が塞ぐ          |
| ⑮   | 契約が宣言したエラーの未実装ゼロ                    | `bun run fitness`                            | —                                     | ⑫ と対（宣言と実装の両側）           |
| ⑯   | 公開 API の破壊的変更が未宣言でないこと             | `bun run fitness`                            | 破壊的変更として宣言する              | 宣言が履歴に残る（⑫ の上に乗る）     |
| ⑰   | 破壊的マイグレーションが未承認でないこと            | `bun run fitness`                            | 承認コメントを書く                    | 承認理由がファイルに残る（⑩ と対）   |
| ⑱   | 組み立てた DOM のアクセシビリティ違反ゼロ           | Vitest（axe）                                | —                                     | 静的な不備は `jsx-a11y` が見る       |
| ⑲   | テンプレート出自の申告が壊れていないこと            | `bun run fitness`                            | `.seri-base.json` ごと消す            | ⑲ が「出自なし」を FAIL にする       |
| ⑳   | 宣言した層のパターンが実ファイルに当たること        | `bun run fitness`                            | 宣言を残したまま対象ファイルを消す    | ⑦ ⑭ の「一致」を実体で裏打ちする     |

⑪ は他のすべての指標の前提です。カテゴリの severity、error にしているルールの集合、
off にしているルールの集合、override で無効化しているルール、`ignorePatterns` の適用範囲を
`@seri/base-tooling` が宣言しているポリシーと突き合わせ、
**`"correctness": "off"` や `"vitest/expect-expect": "off"` のような改ざんを検出**します。

`.oxlintrc.json` は `@seri/base-tooling` の base 設定を `extends` する薄いラッパなので、
⑪ は **`extends` を解決した実効設定**に対して見ます（ADR 0010）。ファイルをそのまま読むと
ポリシーの大半が検査対象から外れ、`extends` を消すだけで ⑪ が何も見なくなります。
`ignorePatterns` は oxlint が継承しないため（実測）、適用範囲はルートに一本化しています。

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

追加の厳格ルールで引数の変更、危険な JSX、弱いテスト比較なども禁止しています。
`void` による Promise の放置、文字列・数値などの暗黙の真偽値変換、不要な Lint 抑制コメントも
エラーです。選定理由は [ADR 0008](docs/adr/0008-stricter-lint.md) を参照してください。

**適応度関数の実装（`scripts/`）自体もテスト対象です。** ここのバグは
「ゲートが黙って緑になる」形で現れ、型検査でも他のテストでも捕まりません
（実際に過去 2 件のゲートがこれで機能していませんでした）。
各検査は `FitnessContext`（`root` / `run` / `ci` / `baseRef`）を引数で受け取るので、
テストは一時ディレクトリに作った擬似リポジトリと差し替えたコマンド実行に対して走ります
（knip も gitleaks も起動しません）。`bun run test:scripts` で単体実行できます。

⑬ は AI に読ませる文書（`CLAUDE.md` と `.claude/skills/**/SKILL.md`）が参照している
ファイルと `bun run` のスクリプトが実在することを検査します。ここが古くなる壊れ方は
誰にも見えません。AI は存在しないパスを黙って諦め、存在しないコマンドを打って別の理由で
失敗するので、原因が文書の陳腐化だと気づけないためです。

⑯ と ⑰ は、⑫ と ⑩ が**乖離しか見ていなかった**穴を塞ぎます。契約と一緒にドキュメントを
再生成すればフィールドを消しても ⑫ は緑で通り、列を消すマイグレーションを正しく生成すれば
⑩ は緑で通ります。⑯ は基準リビジョンとの集合差分で破壊的変更を検出し、
Conventional Commits の `!` / `BREAKING CHANGE:` での宣言を要求します。⑰ は
`DROP TABLE` / `DROP COLUMN` / 既存列への `NOT NULL` 追加 / `WHERE` 無しの一括更新を検出し、
SQL ファイル内の `-- destructive: <理由>` での承認を要求します。どちらも
**通す唯一の手段が意図の記録**なので、回避しても痕跡が残ります。

⑯ の基準リビジョンは `FITNESS_BASE_REF`（既定は `main`）で指定します。基準が `HEAD` と
同じコミットを指す場合（main の上での作業）は `HEAD~1` に落とし、落としたことを結果に
表示します。差分が空になって「破壊的変更なし」と出るのを防ぐためです。CI では
PR ならベースブランチ、push なら `HEAD~1` を渡します（④ ミューテーションと同じ形）。

## コードレビュー（ISO/IEC 25010）

決定論的ゲートが見ないもの（仕様との一致、責務の置き場所、信頼性、安全性など）は、
ISO/IEC 25010:2023 の品質特性を軸に**観点ごとに独立したサブエージェント**でレビューします。

```bash
bun run review:plan   # 変更内容から、起動すべき観点とその理由を出す
```

起動する観点を決めるのは [`scripts/review/route.ts`](scripts/review/route.ts) の純関数です。
**LLM に分類させません。** 分類器が観点を 1 つ黙って落とすと、レビューは
「実施済み・指摘なし」を返し、それを検出する手段がありません。常設は機能適合性と保守性の
2 件で、残り 7 件は変更されたパスで発火します。同時起動は 5 件までにし、
上限で溢れた観点は「今回は起動しない観点」として出力に残します。

観点の一覧は [docs/quality/iso25010.md](docs/quality/iso25010.md)、手順は
`.claude/skills/quality-review/SKILL.md`、判断の経緯は
[docs/adr/0009-iso25010-review-layer.md](docs/adr/0009-iso25010-review-layer.md) にあります。

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

## フック

### Git フック（lefthook）

| フック     | 内容                                                                                   | 目安     |
| ---------- | -------------------------------------------------------------------------------------- | -------- |
| pre-commit | 差分の oxfmt + oxlint（型情報なし）、`package.json` 等を触ったらサプライチェーン検証   | 1 秒未満 |
| commit-msg | Conventional Commits 形式                                                              | 即時     |
| pre-push   | 型情報つき lint / 型検査 / 全テスト+カバレッジ（`scripts/` 込み）/ ビルド / 適応度関数 | 数十秒   |

### Claude Code のフック（`.claude/settings.json`）

判断の記録は [docs/adr/0007-ai-coding-context.md](docs/adr/0007-ai-coding-context.md) の決定 4。

| フック                    | 実体                              | 内容                                                                                        |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| PostToolUse（Edit/Write） | `scripts/hooks/post-edit.ts`      | 契約・DB スキーマ・しきい値を触ったら、再生成や文書追記をその場で促す（⑫ ⑩ より早く気づく） |
| Stop                      | `scripts/hooks/require-commit.ts` | 未コミットの変更があれば応答の終了をブロックする。2 周目は必ず通す（無限ループ防止）        |

> Stop hook は未追跡ファイルも対象にします。恒常的に置いておく生成物は `.gitignore` に入れてください。
> 入れないと読み取り専用の質疑応答でも毎回 1 ターン余分に消費します。

## サプライチェーン対策

詳細は [docs/adr/0003-supply-chain.md](docs/adr/0003-supply-chain.md)。

- **完全固定**: `bunfig.toml` の `exact = true`。未固定の依存が残っていないことを適応度関数が検査する。
  npm パッケージは `x.y.z`、git 依存は **40 桁のコミット SHA** だけを認める
  （ブランチ・タグ・短縮 SHA は後から中身が変わるので通らない）
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
- `packages/db` の直接のテスト（振る舞いは api の統合テストと
  各パッケージの利用側で検証している。`bun run fitness` のワークスペース別表示で可視化される）
- REST 形式の API 公開（契約に `.route()` を足して `OpenAPIHandler` をマウントすれば可能）
