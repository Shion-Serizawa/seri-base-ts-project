---
name: add-procedure
description: このリポジトリに新しい API 手続き（oRPC procedure）を追加・変更・削除するときの手順。契約（packages/contract）→ router（apps/api）→ repository → OpenAPI 再生成 → テスト → web 結線 の順序と、認可・スコープの決まりを固定する。「API を追加したい」「エンドポイントを生やす」「Todo 以外のリソースを作る」「手続きの入出力を変えたい」「router に handler を足す」といった依頼はもちろん、apps/api・packages/contract・apps/web/src/features を触る作業だと分かった時点で必ず参照すること。1 ステップ飛ばすと認可漏れ（型で落ちない書き方をしてしまう）か、docs/openapi.json の乖離で適応度関数 ⑫ が FAIL する。
---

# API 手続きを追加する

パスはすべてリポジトリルートからの相対。前提となる設計判断は再掲しない（単一情報源のため）。
必要になったら読む:

- `docs/adr/0004-orpc-contract-first.md` — なぜ contract-first か、テスト戦略
- `docs/adr/0005-authorization-and-cors.md` — 認可を型で強制する仕組み、CORS
- `README.md` の「セキュリティ」「API ドキュメント（OpenAPI）」「品質ゲート」

既存の Todo 手続きが完全な参照実装なので、**まず該当箇所を読んでから同じ形で書く**。

## 手順

### 1. 契約を書く（`packages/contract`）

- スキーマ: `packages/contract/src/todo.ts` に倣う。識別子は `z.uuid().brand<'…'>()` で
  branded type にする（受け取った id を他の string と取り違えないため）。
  新しいリソースなら `<resource>.ts` / `<resource>-contract.ts` を足し、
  `packages/contract/src/index.ts` から re-export する（未使用 export は knip が落とす）。
- **`apiContract` に名前空間を登録する。** アプリ全体の契約は
  `packages/contract/src/todo-contract.ts` 末尾の `apiContract`（`{ todo: todoContract }`）に
  集約されていて、`index.ts` が re-export しているのはこの 1 つと各スキーマだけ。
  `apps/api/src/rpc/router.ts` は `implement(apiContract)` からビルダーを作るので、
  **ここに足さないとステップ 3 で `os.<resource>` が型に存在せず router を書けない**。
- 契約: `packages/contract/src/todo-contract.ts` に倣い、`oc` で `.input()` / `.output()` /
  `.errors()` を宣言する。**エラーは必ず契約に載せる** — HTTP ステータスの取り決めではなく
  型付きコードとして扱えるようになり、OpenAPI にもそのまま出る。
  - 認証が要る手続きは `UNAUTHORIZED` を持つ `authenticated` ベースから派生させる
  - 他人のリソースに触れうる手続きには `NOT_FOUND` を宣言する（403 は id の存在を漏らす）
- 契約の「面」を固定するテスト（`packages/contract/src/todo-contract.test.ts`）と、
  OpenAPI のパス一覧を固定するテスト（`scripts/openapi/document.test.ts`）の
  手続き一覧は**手で更新する**。ここが落ちるのは意図した変更のサインなので、
  緩めたり消したりしない。
- 型の退化（brand を外す、入力型を広げる）は `packages/contract/src/todo.test-d.ts` の
  型テストで止めている。新しい型にも同じ粒度で 1〜2 本足す。

### 2. URL 定数（必要なときだけ）

新しいマウントポイント（Hono のルート）を足す場合のみ `packages/contract/src/endpoints.ts`
に定数を追加する。**既存の `/api/rpc` 配下に手続きを足すだけなら不要** — oRPC の手続きは
URL ではなく契約のキーで引かれる。

### 3. router を実装する（`apps/api/src/rpc/router.ts`）

`base` ではなく **`os`（認証ミドルウェアを通したビルダー）から実装する**。
`base` から書くと `context.userId` が型に無く、repository 関数に渡せずコンパイルできない
＝「認証を通し忘れた手続き」が型エラーになる、というのがこの設計の要。

handler には業務ロジックだけを書く（入力バリデーションは契約が済ませている）。
エラーは `errors.XXX()` を throw する。最後に `os.router({ … })` へ登録する。

### 4. repository をユーザーでスコープする（`apps/api/src/repositories/`）

`apps/api/src/repositories/todo-repository.ts` に倣う。

- 関数は `userId: string` を**必須の引数**に取る（省略可能にすると付け忘れが型に出ない）
- 単一リソースの取得・更新・削除は `and(eq(t.userId, userId), eq(t.id, id))` でスコープする
- ヒット 0 件は例外にせず `undefined` / `false` を返し、handler 側で `NOT_FOUND` にする
- 新しいテーブルが要るなら `packages/db` にスキーマを足し、所有を表す `userId`
  （`user.id` への FK、cascade delete）を必須列にしてから
  `bun run --filter @seri/db db:generate` → `bun run --filter @seri/db db:migrate:local`。
  列が無いとスコープの付け忘れが型にもテストにも現れない

### 5. OpenAPI を再生成してコミットする

```bash
bun run openapi:generate
```

契約を変えたら必ず実行し、`docs/openapi.json` を差分ごとコミットする。
忘れると適応度関数 ⑫（契約とドキュメントの乖離）が FAIL する。
生成物をコミットするのは、破壊的変更かどうかをレビューで差分として見るため。

### 6. テストを書く

- **apps/api**: `apps/api/src/rpc/router.test.ts` に足す。miniflare 上の実 D1 に対して、
  実際の `RPCLink` の `fetch` を `app.fetch` に差し替えて叩く統合テスト
  （契約・シリアライズ・ルーティング・認証・D1 まで通しで見る）。
  新しい手続きごとに最低限これを書く:
  1. 正常系
  2. 未認証で `UNAUTHORIZED`
  3. **他人のリソースに触れない**（alice / bob の 2 セッションで検証。更新・削除は
     `NOT_FOUND`、かつ元のデータが残っていること）
- **packages/contract**: スキーマの境界値（`packages/contract/src/todo.test.ts`）。
- **apps/web**: `apps/web/src/lib/api-client.ts` をテストダブルに差し替え、
  コンポーネントの振る舞いだけを見る（ワイヤ形式は api 側で検証済み）。
- カバレッジは**ファイル単位で 80%**（行/分岐/関数/文）。新しいファイルを 1 つでも
  素通りさせると落ちる。

### 7. web を結線する（UI が要るとき）

`apps/web/src/features/todos/todos-page.tsx` に倣う。

- 型は `@seri/contract` からのみ取る。`apps/api` の import は oxlint が禁止している
- `orpc.<ns>.<proc>.queryOptions()` / `.mutationOptions()` をそのまま
  `useQuery` / `useMutation` に渡す。**カスタムフックで包み直さない**
  （手書きの型注釈が推論型より狭くなって壊れる）
- 再取得のキーは `orpc.<ns>.<proc>.queryKey()` から取り、手で組まない

## 仕上げ

```bash
bun run typecheck
bun run lint
bun run test
bun run fitness
```

pre-push でも同じものが走る。`bun run fitness` が落ちたら、しきい値や lint 設定を
緩めて通すのではなく実装を直す（設定の改ざん自体を適応度関数 ⑪ が検出する）。

## チェックリスト

- [ ] 契約にエラー（`UNAUTHORIZED` / 必要なら `NOT_FOUND`）を宣言した
- [ ] `os` から実装した（`base` ではない）
- [ ] repository のクエリを `userId` でスコープした
- [ ] 手続き一覧のテストと型テストを更新した
- [ ] `bun run openapi:generate` を実行し `docs/openapi.json` を含めてコミットした
- [ ] 未認証 / 他人のリソースのテストを書いた
- [ ] `apps/web` から `apps/api` を import していない
