import { describe, expect, it } from 'vitest';

import { OPENAPI_SPEC_PATH } from '../../openapi/document.ts';
import { contextOf, makeTempRepo, stubRun } from '../../test/temp-repo.ts';
import type { CommandOutcome } from '../lib/exec.ts';
import { checkOpenApiBreaking } from './openapi-breaking.ts';

/** 最小構成の OpenAPI ドキュメント。 */
function document(options: {
  readonly routes?: readonly string[];
  readonly properties?: readonly string[];
  readonly required?: readonly string[];
  readonly statuses?: readonly string[];
  readonly titleEnum?: readonly string[];
}): string {
  const routes = options.routes ?? ['/todo/list'];
  const properties = Object.fromEntries(
    (options.properties ?? ['id', 'title']).map((name) => [
      name,
      name === 'title' && options.titleEnum !== undefined
        ? { type: 'string', enum: [...options.titleEnum] }
        : { type: 'string' },
    ]),
  );
  const responses = Object.fromEntries(
    (options.statuses ?? ['200', '401']).map((code) => [
      code,
      { content: { 'application/json': { schema: { type: 'object', properties } } } },
    ]),
  );
  const paths = Object.fromEntries(
    routes.map((route) => [
      route,
      {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'object', properties, required: [...(options.required ?? ['id'])] },
              },
            },
          },
          responses,
        },
      },
    ]),
  );
  return JSON.stringify({ openapi: '3.1.1', paths }, null, 2);
}

/**
 * 基準リビジョンの内容を `git show` で返す `run`。
 *
 * `rev-parse` は基準と HEAD で別のコミットを返す（同じだと ⑯ は HEAD~1 に落とす）。
 */
function gitWith(baseSpec: string | null, log = 'feat: 何かを足す\n') {
  return stubRun((command): Partial<CommandOutcome> => {
    if (command.includes('rev-list')) {
      return { status: 0, stdout: command.endsWith('HEAD') ? 'headsha\n' : 'basesha\n' };
    }
    if (command.startsWith('git cat-file')) {
      return baseSpec === null ? { status: 1 } : { status: 0 };
    }
    if (command.startsWith('git show')) {
      return baseSpec === null ? { status: 1 } : { status: 0, stdout: baseSpec };
    }
    if (command.startsWith('git log')) {
      return { status: 0, stdout: log };
    }
    return { status: 0 };
  });
}

/**
 * 以下のスタブは module スコープに置く。`it` の中に条件分岐を書くと
 * `vitest/no-conditional-in-test` が落とす（テストが分岐を持つと決定的でなくなるため）。
 */

/** 基準と HEAD が同じコミットを指す（main の上で作業している状態）。 */
const sameCommitRun = (): ReturnType<typeof stubRun> =>
  stubRun((command): Partial<CommandOutcome> => {
    if (command.includes('rev-list')) {
      return { status: 0, stdout: 'samesha\n' };
    }
    return command.startsWith('git cat-file') ? { status: 1 } : { status: 0 };
  });

/** 基準と HEAD が同じで、さらに HEAD~1 が無い（コミットが 1 本しかない）。 */
const noPreviousRun = (): ReturnType<typeof stubRun> =>
  stubRun((command): Partial<CommandOutcome> => {
    if (command.includes('rev-list') && command.includes('HEAD~1')) {
      return { status: 128 };
    }
    return command.includes('rev-list') ? { status: 0, stdout: 'samesha\n' } : { status: 0 };
  });

/** HEAD だけ解決できない。 */
const headUnresolvableRun = (): ReturnType<typeof stubRun> =>
  stubRun((command): Partial<CommandOutcome> =>
    command.includes('rev-list') && command.endsWith('HEAD')
      ? { status: null }
      : { status: 0, stdout: 'basesha\n' },
  );

/** 基準リビジョンが解決できない。 */
const baseUnresolvableRun = (): ReturnType<typeof stubRun> =>
  stubRun((command) =>
    command.includes('rev-list') ? { status: 128, stderr: 'unknown revision' } : {},
  );

/** git がそもそも起動しない。 */
const gitAbsentRun = (): ReturnType<typeof stubRun> =>
  stubRun((command) => (command.includes('rev-list') ? { status: null } : {}));

/** 比較まではできるが `git log` が読めない。 */
const logUnreadableRun = (baseSpec: string): ReturnType<typeof stubRun> =>
  stubRun((command): Partial<CommandOutcome> => {
    if (command.includes('rev-list')) {
      return { status: 0, stdout: command.endsWith('HEAD') ? 'headsha\n' : 'basesha\n' };
    }
    if (command.startsWith('git show')) {
      return { status: 0, stdout: baseSpec };
    }
    return command.startsWith('git log') ? { status: null } : { status: 0 };
  });

function repoWith(spec: string): string {
  return makeTempRepo({ [OPENAPI_SPEC_PATH]: spec });
}

describe('checkOpenApiBreaking', () => {
  it('公開面が変わっていなければ PASS', () => {
    const spec = document({});

    const result = checkOpenApiBreaking(contextOf(repoWith(spec), gitWith(spec)));

    expect(result.ok).toBe(true);
    expect(result.actual).toBe('破壊的変更なし');
  });

  it('フィールドの追加は破壊的ではない', () => {
    const base = document({ properties: ['id', 'title'] });
    const current = document({ properties: ['id', 'title', 'done'] });

    expect(checkOpenApiBreaking(contextOf(repoWith(current), gitWith(base))).ok).toBe(true);
  });

  it('フィールドの削除を破壊的変更として検出する', () => {
    const base = document({ properties: ['id', 'title'] });
    const current = document({ properties: ['id'] });

    const result = checkOpenApiBreaking(contextOf(repoWith(current), gitWith(base)));

    expect(result.ok).toBe(false);
    expect(result.details?.some((line) => line.includes('削除: フィールド'))).toBe(true);
  });

  it('経路の削除を検出する', () => {
    const base = document({ routes: ['/todo/list', '/todo/remove'] });
    const current = document({ routes: ['/todo/list'] });

    const result = checkOpenApiBreaking(contextOf(repoWith(current), gitWith(base)));

    expect(result.ok).toBe(false);
    expect(result.details?.some((line) => line.includes('/todo/remove'))).toBe(true);
  });

  it('宣言済みのエラー応答の削除を検出する', () => {
    const base = document({ statuses: ['200', '401', '404'] });
    const current = document({ statuses: ['200', '401'] });

    expect(checkOpenApiBreaking(contextOf(repoWith(current), gitWith(base))).ok).toBe(false);
  });

  it('列挙値の削除を検出する', () => {
    const base = document({ titleEnum: ['a', 'b'] });
    const current = document({ titleEnum: ['a'] });

    expect(checkOpenApiBreaking(contextOf(repoWith(current), gitWith(base))).ok).toBe(false);
  });

  it('リクエストの必須項目の追加を検出する', () => {
    const base = document({ required: ['id'] });
    const current = document({ required: ['id', 'title'] });

    const result = checkOpenApiBreaking(contextOf(repoWith(current), gitWith(base)));

    expect(result.ok).toBe(false);
    expect(result.details?.some((line) => line.includes('必須化'))).toBe(true);
  });

  it('必須項目を減らすのは破壊的ではない', () => {
    const base = document({ required: ['id', 'title'] });
    const current = document({ required: ['id'] });

    expect(checkOpenApiBreaking(contextOf(repoWith(current), gitWith(base))).ok).toBe(true);
  });

  it('`feat!:` で宣言されていれば通す', () => {
    const base = document({ properties: ['id', 'title'] });
    const current = document({ properties: ['id'] });
    const run = gitWith(base, 'feat!: title を落とす\n');

    const result = checkOpenApiBreaking(contextOf(repoWith(current), run));

    expect(result.ok).toBe(true);
    expect(result.actual).toContain('宣言済み');
  });

  it('`BREAKING CHANGE:` の本文でも通す', () => {
    const base = document({ properties: ['id', 'title'] });
    const current = document({ properties: ['id'] });
    const run = gitWith(base, 'feat: 整理する\n\nBREAKING CHANGE: title を落とした\n');

    expect(checkOpenApiBreaking(contextOf(repoWith(current), run)).ok).toBe(true);
  });

  it('本文中の `!` を含まない通常のコミットは宣言とみなさない', () => {
    const base = document({ properties: ['id', 'title'] });
    const current = document({ properties: ['id'] });
    const run = gitWith(base, 'fix: すごい変更!\n');

    expect(checkOpenApiBreaking(contextOf(repoWith(current), run)).ok).toBe(false);
  });

  it('基準に OpenAPI が無ければ初回として PASS', () => {
    const result = checkOpenApiBreaking(contextOf(repoWith(document({})), gitWith(null)));

    expect(result.ok).toBe(true);
    expect(result.actual).toBe('基準に無し（初回）');
  });

  it('基準が HEAD と同じコミットなら HEAD~1 に落とし、落としたことを出す', () => {
    // main の上で作業しているとき。差分が空になって「破壊的変更なし」を返すのは false green。
    const result = checkOpenApiBreaking(contextOf(repoWith(document({})), sameCommitRun()));

    expect(result.ok).toBe(true);
    expect(result.actual).toContain('HEAD~1 と比較');
  });

  it('基準が HEAD と同じで HEAD~1 も無ければ FAIL', () => {
    const result = checkOpenApiBreaking(contextOf(repoWith(document({})), noPreviousRun()));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('比較できなかった');
  });

  it('HEAD を解決できなければ FAIL', () => {
    const result = checkOpenApiBreaking(contextOf(repoWith(document({})), headUnresolvableRun()));

    expect(result.ok).toBe(false);
    expect(result.details?.[0]).toContain('HEAD を解決できない');
  });

  it('基準リビジョンを解決できなければ FAIL（計測不能を緑にしない）', () => {
    const result = checkOpenApiBreaking(contextOf(repoWith(document({})), baseUnresolvableRun()));

    expect(result.ok).toBe(false);
    expect(result.details?.[0]).toContain('FITNESS_BASE_REF');
  });

  it('git が起動しなければ FAIL', () => {
    expect(checkOpenApiBreaking(contextOf(repoWith(document({})), gitAbsentRun())).ok).toBe(false);
  });

  it('シェルで解釈が変わる基準リビジョンは受け付けない', () => {
    const context = contextOf(repoWith(document({})), gitWith(null), false, 'main; rm -rf /');

    const result = checkOpenApiBreaking(context);

    expect(result.ok).toBe(false);
    expect(result.details?.[0]).toContain('シェル');
  });

  it('OpenAPI が未生成なら FAIL にして生成方法を案内する', () => {
    const result = checkOpenApiBreaking(contextOf(makeTempRepo({}), gitWith(document({}))));

    expect(result.ok).toBe(false);
    expect(result.details?.[0]).toContain('bun run openapi:generate');
  });

  it('JSON が壊れていれば FAIL（例外で fitness 全体を落とさない）', () => {
    const result = checkOpenApiBreaking(contextOf(repoWith('{ 壊れている'), gitWith(document({}))));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('JSON として読めなかった');
  });

  it('コミットログを読めなければ FAIL', () => {
    const base = document({ properties: ['id', 'title'] });
    const current = document({ properties: ['id'] });
    const result = checkOpenApiBreaking(contextOf(repoWith(current), logUnreadableRun(base)));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('コミットログを読めなかった');
  });
});
