---
name: add-fitness-check
description: このリポジトリに新しい適応度関数（fitness check）を追加・変更するときの手順。scripts/fitness/checks/ に検査を足す、品質ゲートやしきい値を増やす、既存のゲートを直す、「〜を CI で落とすようにしたい」「〜を検査したい」といった依頼のときは必ずこのスキルを使うこと。作法を外すとゲートが黙って緑になる（false green）事故が再発する。
---

# 適応度関数を追加する

このリポジトリの品質ゲートは「単独でハックすると別の指標が悪化する」牽制構造で成り立っている。
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

## 1. 検査を書く: `scripts/fitness/checks/<name>.ts`

`FitnessContext`（[scripts/fitness/lib/context.ts](../../../scripts/fitness/lib/context.ts)）を
**引数で受け取る**。`process.cwd()` / プロセス起動 / 環境変数を直接触ると、テストで擬似リポジトリに
向けられなくなる。

```ts
export function checkThing(context: FitnessContext = defaultContext()): CheckResult {
  // ファイルは join(context.root, ...) で見る
  // 外部コマンドは context.run(...) で呼ぶ
  // CI かどうかは context.ci で見る
}
```

- 戻り値は `CheckResult`（[scripts/fitness/lib/report.ts](../../../scripts/fitness/lib/report.ts)）。
  複数返すなら配列（`checkSizeBudget` / `checkExternalTools` が例）
- 外部コマンドは [scripts/fitness/lib/exec.ts](../../../scripts/fitness/lib/exec.ts) の
  `context.run` と `outputLines`、`node_modules/.bin` は
  [scripts/fitness/lib/bin.ts](../../../scripts/fitness/lib/bin.ts) の `localBin`、
  ソースの走査は [scripts/fitness/lib/walk.ts](../../../scripts/fitness/lib/walk.ts) を使う
- テストのためだけの export を増やさない。⑥′ `knip --production` が落とす。
  テストは公開している検査関数を通して書く（フィクスチャ都合の値は
  `checkSizeBudget(context, budget)` のように**引数の既定値**として渡す）

### false green にしない作法（この手順の本体）

| 状況                                                  | やること            | 理由                                                                         |
| ----------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| 外部コマンドの `status === null`                      | FAIL                | 起動失敗・タイムアウト。「違反なし」に倒すとツールが壊れた瞬間に常に緑になる |
| 終了コードが 0 以外                                   | FAIL                | PASS は exit 0 のみ                                                          |
| 検査対象が存在しない（dist 未ビルド、生成物が無い等） | FAIL                | 「計測できなかった」を緑で出すのが最も危険                                   |
| ツール自体が未導入                                    | `context.ci` で分岐 | ローカルは案内して PASS、CI は FAIL（`checkSecretScan` が例）                |

失敗時は `details` に**次に打つコマンド**を書く（例: `` `bun run build` を実行してから計測する``）。
AI も人間も、そこを読んで直す。

## 2. しきい値は `tooling/quality-gates/src/index.ts` に置く

[tooling/quality-gates/src/index.ts](../../../tooling/quality-gates/src/index.ts) が単一情報源。
数値を検査ファイルに直書きしない。外部ツールの設定ファイル（`.jscpd.json` 等）にも同じ数値を書く場合は、
`tooling/quality-gates/src/external-config.test.ts` に一致検証を足す。
**設定ファイル側だけを緩める**のが最も安易な抜け道なので、ここを塞がないと指標が意味を失う。

## 3. `scripts/fitness/collect.ts` に登録する

[scripts/fitness/collect.ts](../../../scripts/fitness/collect.ts) に追加する。
何をここに含めないか（vitest / oxlint 側で強制しているもの）はファイル冒頭のコメントにある。
`collect.test.ts` の検査名の一覧と件数も更新する。

## 4. 対のテストを書く: `scripts/fitness/checks/<name>.test.ts`

[scripts/test/temp-repo.ts](../../../scripts/test/temp-repo.ts) を使う。

- `makeTempRepo({ 'path/to/file': '内容' })` — 一時ディレクトリに擬似リポジトリを作る（自動削除）
- `stubRun((command) => ({ status: 1, stdout: '...' }))` — コマンド実行を差し替える。
  既定は成功・出力なし。**knip も gitleaks も drizzle-kit も実際には起動しない**
- `contextOf(root, run, ci)` — 検査に渡す `FitnessContext`

**PASS するケースだけでなく、必ず FAIL するケースも書く。** これがこのスキルの一番の要点で、
ここを書き忘れても**誰も検出できない**（他の抜けは §7 のとおり既存ゲートが拾う）。
最低限、上の表の行のうち自分の検査に当てはまるものを 1 件ずつテストにする:

- 違反があるとき FAIL になる
- `status: null`（起動失敗）で FAIL になる
- 検査対象が無いとき FAIL になり、`details` が復旧手順を示す
- CI 分岐があるなら `ci: true` / `false` の両方

書き方は [size-budget.test.ts](../../../scripts/fitness/checks/size-budget.test.ts) と
[secret-scan.test.ts](../../../scripts/fitness/checks/secret-scan.test.ts)、
[external-tools.test.ts](../../../scripts/fitness/checks/external-tools.test.ts) を参照。

`process.exit` を呼ぶだけの実行入口を新設した場合のみ、
[vitest.config.ts](../../../vitest.config.ts) の `exclude` と
[knip.json](../../../knip.json) の `entry`（`!` 付き）に足す。
入口は「引数と終了コードの結線だけ」の数行に切り詰め、判定ロジックは別モジュールに置くこと。

## 5. ドキュメントを更新する

- [README.md](../../../README.md) の品質ゲート表に 1 行足す（# / 指標 / 強制場所 / ハック手段 / 牽制する指標）
- [docs/adr/0002-fitness-functions.md](../../../docs/adr/0002-fitness-functions.md) に、
  **なぜその指標を足したか**と**どの指標と牽制し合うか**を追記する。
  日付つきの節にすると経緯が追える（既存の追記がその形）

## 6. 確認する

```bash
bun run test:scripts   # 検査自体のテスト
bun run fitness        # 実リポジトリに対して一括計測
bun run lint           # 複雑度・any 禁止（型情報つき）
```

`bun run fitness` は実際にビルド成果物を見るものがあるので、必要なら先に `bun run build`。

## 7. 作法を外したときに何が起きるか

- `collect.ts` から参照されない export → ⑥ knip が落とす
- テストの無いファイル → ① ファイル単位カバレッジ 80% が落とす
- しきい値の直書き・設定ファイルだけの緩和 → `tooling/quality-gates` のテストが落とす
- **FAIL ケースのテストの書き忘れ → 何も落ちない。** ここだけは自分で守る

ゲートに詰まったときは**設定を緩めるのではなく実装を直す**。lint 設定の改ざんは
⑪（`tooling/quality-gates/src/lint-policy.ts`）が検出するので、緩める方向は結局通らない。
