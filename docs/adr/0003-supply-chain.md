# 0003. サプライチェーン対策

- 日付: 2026-08-23
- 状態: 採用

## 背景

npm エコシステムへの攻撃は「正規パッケージの新しいバージョンに悪意あるコードが混入する」
形が主流。公開から検知・取り下げまでは短い（数時間〜数日）ことが多く、
**その窓に踏まなければ被害を避けられる**。

「ライブラリをコミットハッシュで固定したい」という要求に対する整理:

| 対象                         | コミットハッシュ固定が可能か                   | 実際に使う手段                                                |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| npm パッケージ               | 不可（レジストリのバージョン単位で配布される） | 完全バージョン固定 + lockfile の integrity ハッシュ（sha512） |
| GitHub Actions               | **可能**                                       | `uses: owner/repo@<40桁 SHA>`                                 |
| ツールチェーン（node / bun） | 配布物のチェックサム                           | `mise.lock`（全プラットフォーム分の SHA256）                  |

## 決定

### 1. 完全固定（レンジ禁止）

`bunfig.toml`:

```toml
[install]
exact = true
```

`^` / `~` を書かせない。`scripts/fitness/checks/supply-chain.ts` が全 `package.json` を走査し、
`x.y.z` か `workspace:*` 以外が混ざっていたら失敗する。

### 2. 公開遅延（cooldown）

```toml
minimumReleaseAge = 604800   # 7 日
```

Bun 1.4 が標準搭載している機能で、公開から N 秒未満のパッケージを解決対象から除外する。
汚染されたリリースが検知・取り下げされるまでの時間を稼ぐ。

実測での副作用: 新しい依存を足すとき、最新版ではなく 7 日以上前のバージョンが選ばれる。
このリポジトリでも `@vitest/coverage-istanbul` が 4.1.11 ではなく 4.1.10 に解決されたため、
vitest 一式を 4.1.10 に揃えている。**これは想定どおりの挙動**。

緊急のセキュリティ修正を取り込むときのみ:

```bash
bun add <pkg> --minimum-release-age=0
```

### 3. integrity 検証と lockfile

- `bun.lock` を commit する（tarball の sha512 が記録される）
- CI は `bun install --frozen-lockfile`
- `--no-verify` は使わない

### 4. postinstall の実行禁止

Bun は**依存パッケージのライフサイクルスクリプトを既定で実行しない**。
実行が必要なパッケージは `package.json` の `trustedDependencies` に明示追加する必要がある。
現在の許可リストは**空**。適応度関数が中身を報告するので、増えたら気づける。

ブロックされたスクリプトの確認: `bun pm untrusted`

### 5. ツールチェーンのチェックサム固定

`mise.toml` に `lockfile = true` を設定し、`mise install` で `mise.lock` を生成する。
node / bun の各プラットフォーム向け配布物の SHA256 と URL が記録されるため、
Windows のローカルと Linux の CI の両方で検証される。mise 2026.1.0 以降が必要。

### 6. GitHub Actions のコミット SHA 固定

すべての `uses:` を 40 桁のコミット SHA で固定し、バージョンをコメントで併記する。

```yaml
- uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
```

可変タグ（`@v4` など）はタグの付け替えで内容が変わる。適応度関数
`actions pinning` が全ワークフローを走査して未固定を検出する。

CI の `permissions` は既定を `contents: read` に絞る（汚染された action に書き込み権限を渡さない）。

### 7. 脆弱性監査

- CI: `bun audit --audit-level=high` で失敗させる
- CI: `bun audit`（全レベル）を参考表示として別ステップで出す

現時点の既知の moderate 2 件は、いずれも推移的依存の側でバージョンが固定されているため
上流の更新待ち。

- `esbuild` … `@esbuild-kit/core-utils` が `~0.18.20` に固定
- `qs` … `typed-rest-client` が `6.15.1` に固定

## 検証

`bun run fitness:deps` で 3 項目（dependency pinning / install policy / actions pinning）を
数百ミリ秒で検証できる。pre-commit では `package.json`・`bunfig.toml`・`mise.toml`・
ワークフローに触ったときだけ走る。
