# 0006. OpenAPI ドキュメントを契約から生成し、乖離をゲートにする

## 背景

API は [0004](0004-orpc-contract-first.md) の通り oRPC の contract-first で、
入出力スキーマとエラーの種類は `packages/contract` に宣言されている。
一方で、外から見える形の API ドキュメントは無かった。

ドキュメントを別に手書きすると、契約を変えたときに更新を忘れて嘘をつく。
「型検査もテストも通るのに、公開している情報だけが古い」という壊れ方は、
スキーマとマイグレーションの関係（[0002](0002-fitness-functions.md) の ⑩）と同じ構図になる。

## 決定

### 1. 実装ではなく契約から生成する

`@orpc/openapi` の `OpenAPIGenerator` に `@seri/contract` の `apiContract` を渡し、
`@orpc/zod/zod4` の `ZodToJsonSchemaConverter` で zod スキーマを JSON Schema に変換する。

```bash
bun run openapi:generate   # docs/openapi.json を書き出す
```

契約は既に入出力スキーマとエラーの種類を持っているので、
ドキュメント専用のアノテーションを別途書く必要がない。実際、生成物には

- `title` の 1〜200 文字という zod の制約
- branded type の `TodoId` が `format: uuid` であること
- 契約で宣言した `UNAUTHORIZED` / `NOT_FOUND` / `BLANK_TITLE` の型付きエラー

がそのまま載る。**契約に書いていないことはドキュメントにも載らない**ので、
「ドキュメントだけが正しい」状態が原理的に起きない。

### 2. Worker には載せない

実行時にエンドポイントで配信する（`OpenAPIHandler` を Worker に入れる）方式は採らなかった。
生成器を Worker のバンドルに載せることになり、適応度関数 ⑧ のバンドルサイズ予算を
ドキュメントのために消費する。転送は oRPC プロトコルのままでよく、
ドキュメントは静的なファイルで足りる。

そのため生成器は `scripts/openapi/` に置き、ルートの devDependency として持つ。
`packages/contract` に `@orpc/openapi` を足すと `apps/web` にも依存が伝播するため、そうしていない。

### 3. 生成物をコミットし、乖離を適応度関数 ⑫ にする

`docs/openapi.json` はコミットする。理由は 2 つ。

- 契約変更が API の破壊的変更かどうかが、**レビューで差分として見える**
- 生成しないと分からない状態（手元でコマンドを叩かないと現状が分からない）を作らない

そのうえで `scripts/fitness/checks/openapi-drift.ts` が、契約から生成した内容と
コミット済みの内容の一致を検証する。食い違ったら FAIL にし、最初に差分が出た行を表示する。

生成物は `.oxfmtrc.json` の `ignorePatterns` に入れている。
フォーマッタが再整形すると、契約は変わっていないのに ⑫ が落ちるため
（この構成にした直後、実際にこれで一度落ちた）。
`.gitattributes` で `linguist-generated=true` にしてレビュー時の差分を折りたたむ。

## 失ったもの・コスト

- 契約を変えたら `bun run openapi:generate` が必要になる。忘れても ⑫ が止めるが、
  pre-push / CI まで気づかない
- 生成される `paths` は `/todo/list` のような手続き名で、REST 的なパスではない。
  REST 風のパスを出すには契約に `.route({ method, path })` を足す必要があるが、
  実際に配信していないパスをドキュメントに載せることになるので今はしていない

## 将来の選択肢

REST 形式の API も公開したくなったら、契約に `.route()` を足して
`OpenAPIHandler` を別プレフィックスにマウントすればよい。
そのとき初めてドキュメントのパスが実在のものになる。
