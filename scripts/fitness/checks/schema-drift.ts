import { join } from 'node:path';

import { localBin } from '../lib/bin.ts';
import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
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

function changedMigrations(context: FitnessContext): string[] {
  const status = context.run(`git status --porcelain -- ${MIGRATIONS_PATH}`, {
    cwd: context.root,
  });
  return status.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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

  const changed = changedMigrations(context);
  if (changed.length > 0) {
    return fail(`${changed.length} 件の未生成の変更`, [
      'スキーマ変更に対するマイグレーションを生成しました。内容を確認してコミットしてください。',
      ...changed,
    ]);
  }

  return { name: NAME, ok: true, actual: '最新', expected: EXPECTED };
}
