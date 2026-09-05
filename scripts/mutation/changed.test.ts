import { describe, expect, it } from 'vitest';

import type { CommandOutcome } from '../fitness/lib/exec.ts';
import { stubRun } from '../test/temp-repo.ts';
import { changedFiles, groupByWorkspace } from './changed.ts';

const always = (): boolean => true;

/** ベース参照つきの diff だけ失敗させ、作業ツリーの diff に落とさせる。 */
function rangedDiffFails(command: string): Partial<CommandOutcome> {
  return command.includes('...') ? { status: 128 } : { status: 0, stdout: 'apps/web/src/b.tsx\n' };
}

describe('changedFiles', () => {
  it('ベースブランチとの差分を使う', () => {
    const run = stubRun(() => ({ status: 0, stdout: 'apps/api/src/a.ts\n' }));

    expect(changedFiles(run, 'origin/main')).toEqual(['apps/api/src/a.ts']);
    expect(run.calls[0]).toContain('origin/main...HEAD');
  });

  it('ベースが解決できなければ作業ツリーの差分に落とす', () => {
    const run = stubRun(rangedDiffFails);

    expect(changedFiles(run, 'origin/missing')).toEqual(['apps/web/src/b.tsx']);
    expect(run.calls).toHaveLength(2);
  });

  it('空行を落とす', () => {
    const run = stubRun(() => ({ status: 0, stdout: 'a.ts\n\n  \nb.ts\n' }));

    expect(changedFiles(run, 'main')).toEqual(['a.ts', 'b.ts']);
  });
});

describe('groupByWorkspace', () => {
  it('ワークスペースごとに相対パスでまとめる', () => {
    const groups = groupByWorkspace(
      ['apps/api/src/rpc/router.ts', 'packages/domain/src/todo.ts'],
      always,
    );

    expect(groups.get('apps/api')).toEqual(['src/rpc/router.ts']);
    expect(groups.get('packages/domain')).toEqual(['src/todo.ts']);
  });

  it('同じワークスペースの複数ファイルを 1 件にまとめる', () => {
    const groups = groupByWorkspace(['apps/api/src/a.ts', 'apps/api/src/b.ts'], always);

    expect(groups.get('apps/api')).toEqual(['src/a.ts', 'src/b.ts']);
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
    expect(groupByWorkspace(['apps/api/src/a.ts']).get('apps/api')).toEqual(['src/a.ts']);
  });

  it('存在しないワークスペースは対象にならない', () => {
    expect(groupByWorkspace(['apps/ghost/src/a.ts']).size).toBe(0);
  });
});
