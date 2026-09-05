# ADR 0008: AI Coding 向けの Lint 強化

- 状態: 採用
- 日付: 2026-09-05

## 背景

既に Oxlint の correctness / suspicious / perf / pedantic、型情報を使う検査、
複雑度制限、TypeScript の strict と追加の厳格オプションが有効だった。
AI Coding を主な開発手段とするため、未採用カテゴリの品質ルールも追加する。

## 決定

style / restriction から 43 ルールを個別採用する。具体的な一覧は
`.oxlintrc.json` と `tooling/quality-gates/src/lint-policy.ts` で管理する。
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
