import type { CommandOutcome, RunCommand } from '@seri/base-tooling/fitness/exec';
import { contextOf, makeTempRepo, stubRun } from '@seri/base-tooling/test';
import { describe, expect, it } from 'vitest';

import { checkSchemaDrift } from './schema-drift.ts';

const OK = { status: 0 };

function isGenerate(command: string): boolean {
  return command.includes('drizzle-kit');
}

const allPass = (): Partial<CommandOutcome> => OK;

function generateReturns(outcome: Partial<CommandOutcome>) {
  return (command: string): Partial<CommandOutcome> => (isGenerate(command) ? outcome : OK);
}

const statusReturns = (stdout: string) => (command: string) =>
  command.startsWith('git status') ? { status: 0, stdout } : OK;

/** `git status` だけを指定の結果に差し替える（drizzle-kit は成功のまま）。 */
const statusFailsWith = (outcome: Partial<CommandOutcome>) => (command: string) =>
  command.startsWith('git status') ? outcome : OK;

type SeenOptions = { readonly cwd?: string; readonly timeoutMs?: number };

/** drizzle-kit の呼び出しに渡されたオプションを記録する。 */
function recordGenerateOptions(): {
  readonly run: RunCommand;
  readonly seen: () => SeenOptions;
} {
  let seen: SeenOptions = {};
  const run: RunCommand = (command, options) => {
    seen = isGenerate(command) ? { ...seen, ...options } : seen;
    return { status: 0, stdout: '', stderr: '' };
  };
  return { run, seen: () => seen };
}

describe('checkSchemaDrift', () => {
  it('生成が成功しマイグレーションに差分が無ければ PASS', () => {
    const result = checkSchemaDrift(contextOf(makeTempRepo({}), stubRun(allPass)));

    expect(result.ok).toBe(true);
    expect(result.actual).toBe('最新');
  });

  it('drizzle-kit を packages/db で実行する', () => {
    const recorder = recordGenerateOptions();

    checkSchemaDrift(contextOf(makeTempRepo({}), recorder.run));

    expect(recorder.seen().cwd).toContain('db');
  });

  it('生成にタイムアウト上限をかける（対話待ちで止まらないように）', () => {
    const recorder = recordGenerateOptions();

    checkSchemaDrift(contextOf(makeTempRepo({}), recorder.run));

    expect(recorder.seen().timeoutMs).toBe(60_000);
  });

  it('status が null（対話待ちで殺された）なら FAIL にする', () => {
    const run = stubRun(generateReturns({ status: null }));

    const result = checkSchemaDrift(contextOf(makeTempRepo({}), run));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('生成が完了しなかった');
  });

  it('status が null のときは対話入力の可能性を案内する', () => {
    const run = stubRun(generateReturns({ status: null }));

    expect(checkSchemaDrift(contextOf(makeTempRepo({}), run)).details?.[0]).toContain('対話入力');
  });

  it('drizzle-kit が失敗したら出力を details に載せる', () => {
    const run = stubRun(generateReturns({ status: 1, stderr: 'schema.ts が読めない\n' }));

    const result = checkSchemaDrift(contextOf(makeTempRepo({}), run));

    expect(result.actual).toBe('drizzle-kit が失敗');
    expect(result.details).toContain('schema.ts が読めない');
  });

  it('git status が失敗したら FAIL にする（変更なしに倒さない）', () => {
    const run = stubRun(statusFailsWith({ status: 128, stderr: 'not a git repository\n' }));

    const result = checkSchemaDrift(contextOf(makeTempRepo({}), run));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('git status が実行できなかった');
  });

  it('git status が起動できなくても（status: null）FAIL にする', () => {
    const run = stubRun(statusFailsWith({ status: null }));

    expect(checkSchemaDrift(contextOf(makeTempRepo({}), run)).ok).toBe(false);
  });

  it('未コミットのマイグレーションが生成されたら FAIL にして一覧を出す', () => {
    const run = stubRun(statusReturns('?? packages/db/migrations/0001_x.sql\n'));

    const result = checkSchemaDrift(contextOf(makeTempRepo({}), run));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('1 件の未生成の変更');
    expect(result.details).toContain('?? packages/db/migrations/0001_x.sql');
  });
});
