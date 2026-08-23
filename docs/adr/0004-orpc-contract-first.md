# 0004. API 層を oRPC の contract-first に移行する

- 日付: 2026-08-23
- 状態: 採用
- 置き換える決定: [0001](0001-infrastructure-and-monorepo.md) の「API 型安全 = Hono RPC (`hc`)」

## 背景

Hono RPC（`hc<AppType>`）は追加依存ゼロで型安全だが、**型がサーバ実装から導出される**という
性質があった。そのため:

- `apps/web` は `apps/api` の実装ソースを型解決する必要があり、Workers 型とブラウザ型が
  混ざる問題を回避するための工夫（`env.ts` で `AnyD1Database` を使う等）が必要だった
- エンドポイントの形を「型だけ先に決めて並行作業する」ことができない。api にルートが
  存在しないと web 側が型を得られない

フロントとバックを並行で進める前提なら、契約を先に確定できる方が有利。

## 決定

`@orpc/*`（1.15.0）で contract-first に移行する。

```
packages/contract   oc で入出力スキーマとエラーを宣言（契約）
apps/api            implement(apiContract) で契約を実装
apps/web            createORPCClient で契約から型を得る
```

- サーバは `implement(apiContract).$context<{ env: Bindings }>()` で実装し、
  `RPCHandler` を Hono の `/api/rpc/*` にマウントする
- クライアントは `RPCLink` + `createORPCClient`、TanStack Query 連携は
  `@orpc/tanstack-query` の `createTanstackQueryUtils`
- エラーは契約で宣言する（`BLANK_TITLE` / `NOT_FOUND`）。HTTP ステータスの取り決めではなく
  **型付きのエラーコード**として扱える

## 得られたもの

1. **`apps/web` から `apps/api` への依存が消えた**。web が参照するのは `@seri/contract` だけ。
   oxlint の `no-restricted-imports` を `allowTypeImports: true` から**完全禁止**に変更した
2. **契約だけ先に確定して並行作業できる**。手続き名・入出力・エラー種別が
   `packages/contract` に集まる
3. クライアント側の zod 再パースが不要になった（型は契約から来る）
4. `@hono/zod-validator` と web の `hono` 依存が不要になった（knip が検出）
5. 入力バリデーションが契約側に寄り、ハンドラは業務ロジックだけになった

## 失ったもの・コスト

- **依存が 4 パッケージ増えた**（`@orpc/contract` / `server` / `client` / `tanstack-query`）。
  api の Worker は gzip 421 KB → **432 KB**（予算 550 KB 以内）
- 型推論のコストは増える。将来ボトルネックになったら計測して判断する
- Hono の `hc` を使わなくなったので、Hono は HTTP レイヤ（CORS・認証委譲・ヘルスチェック）専用になった

## 副作用として捨てた抽象

`apps/web` のカスタムフック層（`use-todos.ts`）を削除した。
`orpc.todo.list.queryOptions()` をそのまま `useQuery` に渡せるため、包み直す意味がない。
包み直すと戻り値の型を手書きする必要が生じ、oRPC と TanStack Query の推論型より狭い型を
書いてしまって壊れる（実際に一度壊した）。

## テスト戦略

- **apps/api**: 実際の `RPCLink` の `fetch` を `app.fetch` に差し替えて呼ぶ。
  契約のバリデーション・ワイヤ形式・ルーティング・D1 アクセスまで通しで検証する
- **apps/web**: `apps/web/src/lib/api-client.ts` をテストダブルに差し替える。
  ワイヤ形式は api 側で検証済みなので、ここではコンポーネントの振る舞いだけを見る
- **packages/contract**: スキーマの境界値と、手続き一覧（契約の「面」）を固定する

## 将来の選択肢

- `@orpc/openapi` を足せば OpenAPI ドキュメントを生成できる（今回は入れていない）
- クライアントがフレームワーク非依存なので、`apps/web` を Svelte 等に差し替えても
  契約とサーバはそのまま使える
