# ADR 0008: AI Coding 向けの Lint 強化

- 状態: 採用
- 日付: 2026-09-05

## 背景

既に Oxlint の correctness / suspicious / perf / pedantic、型情報を使う検査、
複雑度制限、TypeScript の strict と追加の厳格オプションが有効だった。
AI Coding を主な開発手段とするため、未採用カテゴリの品質ルールも追加する。

## 決定

style / restriction からルールを個別採用する。**一覧も件数も
`tooling/quality-gates/src/lint-policy.ts` の `REQUIRED_ERROR_RULES` が単一情報源**で、
`.oxlintrc.json` との一致は ⑪ が完全一致で検証する。件数はここには書かない
（増減するたびに文書だけが古くなり、機械では検出できない）。
引数とそのプロパティの変更、動的コード実行、可変 export、空オブジェクト型、
catch コールバックの暗黙の any、危険な JSX、テストの重複や弱い比較を制限する。

既存の no-floating-promises は ignoreVoid を false にし、void を付けるだけの
未処理 Promise を拒否する。strict-boolean-expressions は文字列・数値・nullable
オブジェクトの暗黙の真偽値変換も拒否する。

警告と不要な disable コメントも失敗にする。ルール名なしの一括抑制を禁止する。
`lint:fix` は通常の `lint` と同じ型情報を使う。`lint:quick` と pre-commit は
従来どおり型情報なしで、CI / pre-push は型情報つきの全体検査を維持する。

style / restriction / nursery の一括有効化は行わない。相反する export 規約や、
React の null、async/await、ルーティング規約まで禁止するルールが含まれるため。
ルールの選定は [Oxlint のカテゴリ仕様](https://oxc.rs/docs/guide/usage/linter/config) と
インストール済みバージョンのルール一覧・設定スキーマに基づく。

## 検証と影響

既存テストの toEqual を toStrictEqual に変更し、undefined のプロパティや
プロトタイプなどの違いを見逃さないようにする。本番コードの動作変更はない。
ポリシーテストで追加設定を固定し、実際の CLI に不正なコードを渡すテストで
型情報つきルールを含む検出と、適切なコードの成功を検証する。

新しい実装は引数を直接変更せず、Promise の失敗を明示的に処理する必要がある。
外部 API の仕様で例外が必要な場合は理由と対象を限定してレビューする。

## ⑪ の適用範囲を固定した（2026-09-05）

レビューで、⑪ が categories / plugins / rules / overrides の **severity** しか見ておらず、
**適用範囲**が素通しになっていることが分かった。新ルールで大量にエラーが出たときに
`.oxlintrc.json` の `ignorePatterns` に `"apps/web/src/**"` を 1 行足せばエラーは消え、
⑪ のテストは全部緑のまま通る。severity の改ざんを塞いだのと同じ抜け道が、
範囲指定の側に残っていた。

対応:

- `oxlintrcSchema` を `.strict()` にした。非 strict の `z.object` は未知のトップレベルキーを
  パースの時点で捨てるため、`ignorePatterns` はどのアサーションからも見えていなかった
- 除外先を `LINT_IGNORE_PATTERNS` としてポリシー化し、完全一致で固定した。
  あわせて「除外がソースディレクトリを覆っていない」ことも検証する
- `overrides[].files` がリポジトリ全体を覆う場合は、`ALLOWED_OVERRIDE_OFF_RULES` に
  載っているルールであっても `off` を認めない。ディレクトリ単位の例外という建前が
  成立しなくなるため

## 既知の制約: `lint:quick` と不要な disable コメント

`options.reportUnusedDisableDirectives: "error"` はグローバル設定なので、型情報なしで走る
`lint:quick`（pre-commit）にも効く。**型情報つきでしか報告されないルールに対する正当な
抑制コメントは、`lint:quick` では「未使用の disable」と判定される。**

つまり `// oxlint-disable-next-line typescript/no-floating-promises` を 1 行入れると、
`bun run lint` は緑、pre-commit は exit 1 になりうる。ルール名なしの `// oxlint-disable` に
逃げると `unicorn/no-abusive-eslint-disable` に引っかかる。

現時点で該当する抑制コメントは 0 件なので設定は変えていない。最初の 1 件が出たときは、
抑制コメントではなく `overrides` でスコープを切って表現する。それでも足りなければ
`lint:quick` 側だけ unused-disable の報告を落とす。
