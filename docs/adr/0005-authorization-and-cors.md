# 0005. 参照実装に認可を入れ、CORS を許可リストにする

- 日付: 2026-08-25
- 状態: 採用

## 背景

第三者によるレビューで、参照実装（Todo）に**認可が無い**ことが指摘された。

- `router.ts` のハンドラは `context: { env }` しか受け取らず、セッションを見ていなかった
- `todos` テーブルに `userId` が無かった
- 結果として、**認証済みの任意のユーザーが他人の Todo を list / setDone / remove できた**

さらに問題は、**8 つの適応度関数がどれも鳴らなかった**ことである。`apps/api` は
statement coverage 100%、複雑度・重複・ミューテーションもすべて緑だった。

テンプレートとしてこれが一番高くつく。AI は既存パターンを踏襲するので、
「env しか持たないハンドラ」「userId を取らないリポジトリ関数」を機能追加のたびに量産し、
品質ゲートは 1 つも鳴らない。

同時に CORS も指摘された。

```ts
cors({ origin: (origin) => origin, credentials: true });
```

web と api は別 Worker（別オリジン）なので Cookie は cross-site 前提になる。
ここで任意オリジンを反射しつつ `credentials: true` を許すと、
**任意のサイトからログイン済みユーザーの資格情報で API を叩ける**。

## 決定

### 1. 認可を型で強制する

`packages/db` の `todos` に `userId`（`user.id` への FK、cascade delete）を必須で追加した。
列が無ければ「スコープの付け忘れ」が型にもテストにも現れないため、
**データモデルの側で所有を表現する**のが起点になる。

`apps/api` は oRPC のミドルウェアでセッションを解決し、`context.userId` を渡す。

```ts
const base = implement(apiContract).$context<{ env: Bindings; headers: Headers }>();

const os = base.use(async ({ context, next, errors }) => {
  const session = await createAuth(context.env).api.getSession({ headers: context.headers });
  if (session === null) {
    throw errors.UNAUTHORIZED();
  }
  return await next({ context: { userId: session.user.id } });
});
```

**重要なのは `base` ではなく `os` から手続きを実装すること。**
`base` から実装した手続きは `context.userId` を持たないため、
リポジトリ関数（`userId: string` を要求する）に渡せずコンパイルできない。
つまり「認証ミドルウェアを通し忘れた手続き」は**型エラーになる**。

リポジトリ関数はすべて `userId` を必須の引数に取り、クエリを
`and(eq(todos.userId, userId), eq(todos.id, id))` でスコープする。

他人の Todo に対する更新・削除は **NOT_FOUND** を返す。403 を返すと id の存在が漏れる。

### 2. 認可のテストを置く

`router.test.ts` に「他人の Todo に触れない」describe を追加した。
2 人のユーザー（alice / bob）を実際にサインアップさせ、セッション Cookie 付きの
oRPC クライアントを 2 つ作って検証する。

- 他人が作った Todo は一覧に出ない
- 他人の Todo は更新できない（NOT_FOUND）
- 他人の Todo は削除できない
- 他人が削除を試みても元の Todo は残る

未認証アクセスも 4 手続きすべてで UNAUTHORIZED になることを確認している。

このテストに歯があることは、`listTodos` から `.where(eq(todos.userId, userId))` を
外して実際に失敗させて確認した。

### 3. CORS を許可リストにする

オリジンの反射をやめ、バインディング `ALLOWED_ORIGINS`（カンマ区切り）で判定する。

```ts
cors({
  origin: (origin: string, c: Context<AppEnv>) => allowedOrigin(origin, c.env.ALLOWED_ORIGINS),
  credentials: true,
});
```

`allowedOrigin` は `Bindings` ではなく文字列を受け取る純粋関数にした。
テストのために `Bindings` のダミーを作る必要がなくなり（`{} as D1Database` のような
不正なキャストが不要になり）、境界値もそのまま検証できる。

## マイグレーションを squash した

`todos` に NOT NULL の `userId` を追加するにあたり、既存の 2 つのマイグレーションを削除して
`0000` から再生成した。SQLite は NOT NULL 列の追加にテーブル再作成が必要で、
drizzle-kit が対話入力を求める可能性があるため。**まだデプロイしていないベースリポジトリ**
だからできる判断で、運用開始後は squash せずに追加のマイグレーションを書く。

## 適応度関数側の対応

「認可が無いことを検出できなかった」問題そのものは、適応度関数では埋めていない。
認可の有無は仕様の問題であり、汎用の指標で検出できるものではないと判断した。

代わりに **型で強制する**構造にした（`context.userId` が無ければコンパイルできない）。
これが「AI が既存パターンを踏襲する」性質に対する実効的な防御になる。

CI にセキュリティスキャン（CodeQL / semgrep）を入れることは今回見送った。
CORS の設定ミスのような論理的な穴は静的解析では拾いにくく、
それより認可のテストを置く方が費用対効果が高いと判断した。
外部公開する段階で再検討する。
