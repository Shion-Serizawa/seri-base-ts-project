import { join } from 'node:path';

import { localBin } from '../lib/bin.ts';
import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import type { CommandOutcome } from '../lib/exec.ts';
import { outputLines } from '../lib/exec.ts';
import type { CheckResult } from '../lib/report.ts';

const MIGRATIONS_PATH = 'packages/db/migrations';
const GENERATE_TIMEOUT_MS = 60_000;
const NAME = 'schema drift';
const EXPECTED = 'マイグレーションが最新';
const MAX_DETAIL_LINES = 8;

function fail(actual: string, details: readonly string[]): CheckResult {
  return { name: NAME, ok: false, actual, expected: EXPECTED, details };
}

type MigrationStatus =
  | { readonly ok: true; readonly changed: string[] }
  | { readonly ok: false; readonly outcome: CommandOutcome };

/**
 * マイグレーションディレクトリの未コミット変更を列挙する。
 *
 * git が失敗したときの空の stdout を「変更なし」と読むと、drizzle-kit が
 * マイグレーションを生成していてもこの検査が緑になる（false green）。
 * 終了コードを呼び出し側に返して、計測不能を失敗として扱わせる。
 */
function changedMigrations(context: FitnessContext): MigrationStatus {
  const outcome = context.run(`git status --porcelain -- ${MIGRATIONS_PATH}`, {
    cwd: context.root,
  });
  if (outcome.status !== 0) {
    return { ok: false, outcome };
  }
  return {
    ok: true,
    changed: outcome.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  };
}

/**
 * 適応度関数 ⑩ スキーマとマイグレーションの乖離。
 *
 * `schema.ts` を変えたのに `drizzle-kit generate` を忘れると、
 * 型チェックもテストも通るのに本番の D1 だけが古いまま、という壊れ方をする。
 * 型でもテストでも守れない箇所なのでここで検出する。
 *
 * 注意: 乖離があった場合、この検査は新しいマイグレーションファイルを実際に生成する。
 * 生成されたファイルは内容を確認してそのままコミットすればよい。
 */
export function checkSchemaDrift(context: FitnessContext = defaultContext()): CheckResult {
  const generate = context.run(`${localBin(context.root, 'drizzle-kit')} generate`, {
    cwd: join(context.root, 'packages', 'db'),
    timeoutMs: GENERATE_TIMEOUT_MS,
  });

  if (generate.status === null) {
    return fail('生成が完了しなかった', [
      'drizzle-kit が対話入力（列のリネーム確認など）を求めた可能性がある。',
      '`bun run --filter @seri/db db:generate` を手動で実行して確認する。',
    ]);
  }

  if (generate.status !== 0) {
    return fail('drizzle-kit が失敗', outputLines(generate, MAX_DETAIL_LINES));
  }

  const migrations = changedMigrations(context);
  if (!migrations.ok) {
    return fail('git status が実行できなかった', [
      'マイグレーションの差分を確認できないため、乖離の有無を判定できない。',
      ...outputLines(migrations.outcome, MAX_DETAIL_LINES),
    ]);
  }

  if (migrations.changed.length > 0) {
    return fail(`${migrations.changed.length} 件の未生成の変更`, [
      'スキーマ変更に対するマイグレーションを生成しました。内容を確認してコミットしてください。',
      ...migrations.changed,
    ]);
  }

  return { name: NAME, ok: true, actual: '最新', expected: EXPECTED };
}
