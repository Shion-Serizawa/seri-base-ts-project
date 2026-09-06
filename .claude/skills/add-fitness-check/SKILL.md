---
name: add-fitness-check
description: 適応度関数（fitness check）を追加・変更するときの手順。scripts/fitness/project/ に検査を足す、品質ゲートやしきい値を増やす、既存のゲートを直す、「〜を CI で落とすようにしたい」「〜を検査したい」といった依頼のときは必ずこのスキルを使うこと。ゲートの本体は別リポジトリ（@seri/base-tooling）にあるため、どちらを直すかの判断から始まる。作法を外すとゲートが黙って緑になる（false green）事故が再発する。
---

# 適応度関数を追加する

品質ゲートは「単独でハックすると別の指標が悪化する」牽制構造で成り立っている。
背景と各指標の意図は [docs/adr/0002-fitness-functions.md](../../../docs/adr/0002-fitness-functions.md)、
指標の一覧は [README.md](../../../README.md) の「品質ゲート」節にある。**ここでは再掲しない**ので、
新しい指標を設計する前に ADR の「牽制の構造」と「レビューで判明した穴と対応」を読むこと。

最重要の前提: **ゲートの実装のバグは「常に PASS」という形で現れ、型検査でも他のテストでも捕まらない。**
過去 2 件（バンドルサイズの未ビルド時 PASS、test ratio の集計単位）が実際にこれで機能していなかった。
以下の手順はその再発防止のためにある。

## 0. まず指標を選ぶ

- 既存指標のどれかをハックしたときに悪化する側になっているか、あるいは
  「型でもテストでも守れない性質のもの」（生成物の乖離・依存の固定・シークレット）か
- 単独で最適化できてしまう指標（割合で許容量を与える類）は避ける。ADR の「却下した案」を参照

## 1. どちらのリポジトリを直すかを決める

**ここを間違えると、直したものが派生に届かないか、逆に届いてはいけないものが届く。**
判定は 1 つだけ。

> その検査は、リポジトリの**形**（`apps/api` / `packages/contract` / `packages/db/migrations`
> といった構造）を知る必要があるか？

| 答え           | 層   | リポジトリ                                                                               |
| -------------- | ---- | ---------------------------------------------------------------------------------------- |
| 知らなくてよい | A 層 | [seri-base-tooling](https://github.com/Shion-Serizawa/seri-base-tooling)（別リポジトリ） |
| 知る必要がある | C 層 | このリポジトリの `scripts/fitness/project/`                                              |

境界の理由は [docs/adr/0010-base-repo-derivation-and-propagation.md](../../../docs/adr/0010-base-repo-derivation-and-propagation.md)。

**A 層の場合はこのリポジトリを触らない。** `seri-base-tooling` 側で実装・テストし、
main に push してから、このリポジトリの `package.json` の
`@seri/base-tooling` の SHA を上げて `bun install` する。
枠組み（`runFitness` / `FitnessContext` / `CheckResult`）をこちらに書き足さないこと。

形を知る必要があるように見えても、**値で受け取れるなら A 層に置ける**。
対象ディレクトリやバンドルの予算は `FitnessContext` の `sourceRoots` / `bundles` で渡している。
決め打ちにすると、レイアウトの違う派生で対象が 0 件になり
「ソースが見つからない」ではなく「違反なし」で通る。

以下は C 層（このリポジトリ）に足す場合の手順。

## 2. 検査を書く: `scripts/fitness/project/<name>.ts`

`FitnessContext` を**引数で受け取る**。`process.cwd()` / プロセス起動 / 環境変数を直接触ると、
テストで擬似リポジトリに向けられなくなる。

```ts
import type { FitnessContext } from '@seri/base-tooling/fitness/context';
import { defaultContext } from '@seri/base-tooling/fitness/context';
import type { CheckResult } from '@seri/base-tooling/fitness/report';

export function checkThing(context: FitnessContext = defaultContext()): CheckResult {
  // ファイルは join(context.root, ...) で見る
  // 外部コマンドは context.run(...) で呼ぶ
  // CI かどうかは context.ci で見る
}
```

A 層が提供している道具:

| import                                     | 中身                                        |
| ------------------------------------------ | ------------------------------------------- |
| `@seri/base-tooling/fitness/context`       | `FitnessContext` / `defaultContext`         |
| `@seri/base-tooling/fitness/report`        | `CheckResult` / `printReport`               |
| `@seri/base-tooling/fitness/exec`          | `runCommand` / `outputLines`                |
| `@seri/base-tooling/fitness/bin`           | `localBin`（`node_modules/.bin` の解決）    |
| `@seri/base-tooling/fitness/walk`          | `listSourceFiles` / `isTestFile` / 行数計測 |
| `@seri/base-tooling/fitness/compare`       | `differences`（宣言と実物の突き合わせ）     |
| `@seri/base-tooling/fitness/oxlint-config` | `.oxlintrc.json` の `extends` 解決          |
| `@seri/base-tooling`                       | `QUALITY_GATES` と Lint ポリシーの宣言      |

- 戻り値は `CheckResult`。複数返すなら配列
- テストのためだけの export を増やさない。⑥′（`knip --production`）が落とす

### false green にしない作法（この手順の本体）

| 状況                                                  | やること            | 理由                                                                         |
| ----------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| 外部コマンドの `status === null`                      | FAIL                | 起動失敗・タイムアウト。「違反なし」に倒すとツールが壊れた瞬間に常に緑になる |
| 終了コードが 0 以外                                   | FAIL                | PASS は exit 0 のみ                                                          |
| 検査対象が存在しない（dist 未ビルド、生成物が無い等） | FAIL                | 「計測できなかった」を緑で出すのが最も危険                                   |
| ツール自体が未導入                                    | `context.ci` で分岐 | ローカルは案内して PASS、CI は FAIL                                          |

失敗時は `details` に**次に打つコマンド**を書く（例: `` `bun run build` を実行してから計測する``）。
AI も人間も、そこを読んで直す。

## 3. しきい値は `QUALITY_GATES` に置く

数値を検査ファイルに直書きしない。`QUALITY_GATES` は `@seri/base-tooling` にあるので、
**しきい値を足すのも A 層の変更**になる。外部ツールの設定ファイル（`.jscpd.json` 等）にも
同じ数値を書く場合は、A 層の `threshold drift` に比較を 1 行足す。
**設定ファイル側だけを緩める**のが最も安易な抜け道なので、ここを塞がないと指標が意味を失う。

## 4. `scripts/fitness/project/checks.ts` に登録する

配列に足し、[scripts/fitness/run.ts](../../../scripts/fitness/run.ts) の
`EXPECTED_PROJECT_RESULTS` を実際の件数に合わせる。
**件数の宣言がずれると `project checks` が FAIL する**（差し込み漏れを黙って通さないため）。

`scripts/fitness/project/checks.test.ts` の検査名の一覧と件数も更新する。

**フィクスチャも直す。** テストは「全件 PASS」を検証するので、新しい検査が PASS するために
必要なファイルを足さないと落ちる。実物の設定は
`repositoryConfigFiles()`（`@seri/base-tooling/test`）が運んでくる。
ここで落ちたときに「検査の実装が悪い」と誤診してしきい値や判定を緩めるのが最悪の手。
まずフィクスチャ不足を疑う。

## 5. 対のテストを書く: `scripts/fitness/project/<name>.test.ts`

`@seri/base-tooling/test` を使う。

- `makeTempRepo({ 'path/to/file': '内容' })` — 一時ディレクトリに擬似リポジトリを作る（自動削除）
- `stubRun((command) => ({ status: 1, stdout: '...' }))` — コマンド実行を差し替える。
  既定は成功・出力なし。**gitleaks も drizzle-kit も実際には起動しない**
- `contextOf(root, run, ci, baseRef)` / `contextWith(root, overrides)` — 検査に渡す `FitnessContext`
- `repositoryConfigFiles()` — 実物の設定ファイル一式（`extends` 先も含む）

**PASS するケースだけでなく、必ず FAIL するケースも書く。** これがこのスキルの一番の要点で、
ここを書き忘れても**誰も検出できない**（他の抜けは §8 のとおり既存ゲートが拾う）。
最低限、上の表の行のうち自分の検査に当てはまるものを 1 件ずつテストにする。

書き方は [layer-boundary.test.ts](../../../scripts/fitness/project/layer-boundary.test.ts) と
[migration-safety.test.ts](../../../scripts/fitness/project/migration-safety.test.ts) を参照。

`process.exit` を呼ぶだけの実行入口を新設した場合のみ、
[vitest.config.ts](../../../vitest.config.ts) の `exclude` と
[knip.json](../../../knip.json) の `entry`（`!` 付き）に足す。

## 6. ドキュメントを更新する

- [README.md](../../../README.md) の品質ゲート表に 1 行足す（# / 指標 / 強制場所 / ハック手段 / 牽制する指標）
- [docs/adr/0002-fitness-functions.md](../../../docs/adr/0002-fitness-functions.md) に、
  **なぜその指標を足したか**と**どの指標と牽制し合うか**を追記する

## 7. 確認する

```bash
bun run test:scripts   # 検査自体のテスト
bun run fitness        # 実リポジトリに対して一括計測
bun run lint           # 複雑度・any 禁止（型情報つき）
```

`bun run fitness` は実際にビルド成果物を見るものがあるので、必要なら先に `bun run build`。

**`bun` で実行すること。** Node は `node_modules` 配下の `.ts` を型除去できないので、
`@seri/base-tooling` を import するスクリプトは `node` では動かない。

## 8. 作法を外したときに何が起きるか

- どこからも参照されない export → ⑥ knip が落とす
- テストの無いファイル → ① ファイル単位カバレッジ 80% が落とす
- しきい値の直書き・設定ファイルだけの緩和 → ⑪′ `threshold drift` が落とす
- 件数の宣言忘れ → `project checks` が落とす
- **FAIL ケースのテストの書き忘れ → 何も落ちない。** ここだけは自分で守る

ゲートに詰まったときは**設定を緩めるのではなく実装を直す**。lint 設定の改ざんは
⑪ `lint policy` が検出するので、緩める方向は結局通らない。
