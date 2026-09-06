import type { CommandOutcome } from '@seri/base-tooling/fitness/exec';
import { stubRun } from '@seri/base-tooling/test';
import { describe, expect, it } from 'vitest';

import { changedFiles, groupByWorkspace } from './changed.ts';

const always = (): boolean => true;

/** ベース参照つきの diff だけ失敗させ、作業ツリーの diff に落とさせる。 */
function rangedDiffFails(command: string): Partial<CommandOutcome> {
  return command.includes('...') ? { status: 128 } : { status: 0, stdout: 'apps/web/src/b.tsx\n' };
}

describe('changedFiles', () => {
  it('ベースブランチとの差分を使う', () => {
    const run = stubRun(() => ({ status: 0, stdout: 'apps/api/src/a.ts\n' }));

    expect(changedFiles(run, 'origin/main')).toStrictEqual(['apps/api/src/a.ts']);
    expect(run.calls[0]).toContain('origin/main...HEAD');
  });

  it('ベースが解決できなければ作業ツリーの差分に落とす', () => {
    const run = stubRun(rangedDiffFails);

    expect(changedFiles(run, 'origin/missing')).toStrictEqual(['apps/web/src/b.tsx']);
    expect(run.calls).toHaveLength(2);
  });

  it('CI が push 時に渡す HEAD~1 をベースとして使う', () => {
    // `~` を弾いていたため、main への push で差分基準が黙って作業ツリー差分に落ち、
    // ④ の牽制が実質効いていなかった。
    const run = stubRun(() => ({ status: 0, stdout: 'apps/api/src/a.ts\n' }));

    expect(changedFiles(run, 'HEAD~1')).toStrictEqual(['apps/api/src/a.ts']);
    expect(run.calls[0]).toContain('HEAD~1...HEAD');
  });

  it('cmd.exe がエスケープ文字として食う `^` は使わない', () => {
    const run = stubRun(() => ({ status: 0, stdout: 'apps/web/src/b.tsx' }));

    changedFiles(run, 'HEAD^');

    expect(run.calls).toStrictEqual(['git diff --name-only HEAD']);
  });

  it('シェルを解釈しうる ref 名は使わず、作業ツリーの差分に落とす', () => {
    const run = stubRun(() => ({ status: 0, stdout: 'apps/web/src/b.tsx' }));

    changedFiles(run, 'feat/$(id)');

    expect(run.calls).toStrictEqual(['git diff --name-only HEAD']);
  });

  it('空行を落とす', () => {
    const run = stubRun(() => ({ status: 0, stdout: 'a.ts\n\n  \nb.ts\n' }));

    expect(changedFiles(run, 'main')).toStrictEqual(['a.ts', 'b.ts']);
  });
});

describe('groupByWorkspace', () => {
  it('ワークスペースごとに相対パスでまとめる', () => {
    const groups = groupByWorkspace(
      ['apps/api/src/rpc/router.ts', 'packages/domain/src/todo.ts'],
      always,
    );

    expect(groups.get('apps/api')).toStrictEqual(['src/rpc/router.ts']);
    expect(groups.get('packages/domain')).toStrictEqual(['src/todo.ts']);
  });

  it('同じワークスペースの複数ファイルを 1 件にまとめる', () => {
    const groups = groupByWorkspace(['apps/api/src/a.ts', 'apps/api/src/b.ts'], always);

    expect(groups.get('apps/api')).toStrictEqual(['src/a.ts', 'src/b.ts']);
  });

  it('テストファイル自身は対象にしない（テストを変えただけでは走らせない）', () => {
    const groups = groupByWorkspace(['apps/api/src/a.test.ts', 'apps/api/src/b.spec.tsx'], always);

    expect(groups.size).toBe(0);
  });

  it('src 配下でないファイルは対象にしない', () => {
    const groups = groupByWorkspace(
      ['apps/api/vitest.config.ts', 'packages/db/migrations/0000.sql', 'README.md'],
      always,
    );

    expect(groups.size).toBe(0);
  });

  it('tooling と scripts は対象にしない', () => {
    const groups = groupByWorkspace(
      ['tooling/quality-gates/src/index.ts', 'scripts/fitness/run.ts'],
      always,
    );

    expect(groups.size).toBe(0);
  });

  it('vitest 設定が無いワークスペースは飛ばす', () => {
    expect(groupByWorkspace(['packages/db/src/schema.ts'], () => false).size).toBe(0);
  });
});

describe('vitest 設定の有無（既定の判定）', () => {
  it('vitest.config.ts があるワークスペースは対象になる', () => {
    expect(groupByWorkspace(['apps/api/src/a.ts']).get('apps/api')).toStrictEqual(['src/a.ts']);
  });

  it('存在しないワークスペースは対象にならない', () => {
    expect(groupByWorkspace(['apps/ghost/src/a.ts']).size).toBe(0);
  });
});
