/**
 * 層の依存方向（適応度関数 ⑦）と認可スコープの境界（⑭）。
 *
 * ADR 0010 の C 層。`@seri/contract` / `@seri/db` といったこのテンプレート固有の
 * ワークスペース名を直接持つので、@seri/base-tooling（A 層）には置けない。
 * 派生リポジトリは自分の層構成をここに書く。
 *
 * `.oxlintrc.json` の `overrides` に書いた `no-restricted-imports` を、
 * **出現順・対象ファイル・許可先まで完全一致で**固定する。
 *
 * ここを固定しないと、境界に詰まったときに allowlist へ `!@seri/db` を 1 行足すだけで
 * lint が黙り、他のアサーションは全部緑のまま通る。severity の改ざんと同じ抜け道で、
 * しかも認可漏れに直結する側なので、severity より強く縛る。
 *
 * 順序が意味を持つ点に注意: oxlint の override は後勝ちなので、
 * `apps/api/src/**`（db 禁止）より後に `*-table.ts`（db 許可）が来ていなければならない。
 */
export const LAYER_IMPORT_POLICY = [
  { files: ['packages/contract/src/**'], allowed: [] },
  { files: ['packages/domain/src/**'], allowed: ['@seri/contract'] },
  { files: ['packages/db/src/**'], allowed: ['@seri/contract'] },
  { files: ['apps/api/src/**'], allowed: ['@seri/contract', '@seri/domain'] },
  {
    files: ['apps/api/src/repositories/*-table.ts', 'apps/api/src/lib/auth.ts'],
    allowed: ['@seri/contract', '@seri/db', '@seri/domain'],
  },
  { files: ['apps/web/src/**'], allowed: ['@seri/contract', '@seri/domain'] },
] as const;

/**
 * `no-restricted-imports` の `group` が必ず先頭に持つ、ワークスペース全体の遮断パターン。
 * サブパス（`@seri/db/schema`）を含めないと境界が素通りする。
 */
export const WORKSPACE_IMPORT_DENY = ['@seri/*', '@seri/*/**'] as const;

/**
 * 生の Drizzle テーブルに触れてよいファイル。
 *
 * ここが広がると、where 句にセッションのユーザーを付け忘れたクエリを書ける場所が増える。
 */
export const DB_REACHABLE_FILES = [
  'apps/api/src/repositories/*-table.ts',
  'apps/api/src/lib/auth.ts',
] as const;
