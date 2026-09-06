import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { runCommand } from '@seri/base-tooling/fitness/exec';

import { changedFiles, groupByWorkspace } from './changed.ts';

/**
 * 適応度関数 ④ ミューテーションスコア（変更ファイルのみ）。
 *
 * 全体に対して実行すると時間がかかりすぎるため、ベースブランチとの差分に絞る。
 * この指標は「アサーションのないテストでカバレッジだけ上げる」ハックを直接失敗させる。
 */
const CONFIG_PATH = resolve('stryker.config.json');

function runStryker(workspace: string, mutate: readonly string[]): number {
  console.log(`\n=== mutation: ${workspace} (${mutate.length} files) ===`);
  const result = spawnSync('bunx', ['stryker', 'run', CONFIG_PATH, '--mutate', mutate.join(',')], {
    cwd: workspace,
    stdio: 'inherit',
    shell: true,
  });
  return result.status ?? 1;
}

const baseRef = process.env['MUTATION_BASE_REF'] ?? 'origin/main';
const groups = groupByWorkspace(changedFiles(runCommand, baseRef));
if (groups.size === 0) {
  console.log('変更された実装ファイルが無いため、ミューテーションテストをスキップします。');
  process.exit(0);
}

const failures = [...groups.entries()]
  .map(([workspace, mutate]) => runStryker(workspace, mutate))
  .filter((status) => status !== 0);

process.exit(failures.length === 0 ? 0 : 1);
