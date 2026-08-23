import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 適応度関数 ④ ミューテーションスコア（変更ファイルのみ）。
 *
 * 全体に対して実行すると時間がかかりすぎるため、ベースブランチとの差分に絞る。
 * この指標は「アサーションのないテストでカバレッジだけ上げる」ハックを直接失敗させる。
 */
const BASE_REF = process.env['MUTATION_BASE_REF'] ?? 'origin/main';
const SOURCE_PATTERN = /^(apps|packages)\/([^/]+)\/src\/.+\.tsx?$/u;
const TEST_PATTERN = /\.(?:test|spec)\.tsx?$/u;
const CONFIG_PATH = resolve('stryker.config.json');

function changedFiles(): string[] {
  const ranged = spawnSync('git', ['diff', '--name-only', `${BASE_REF}...HEAD`], {
    encoding: 'utf8',
  });
  const output =
    ranged.status === 0
      ? ranged.stdout
      : spawnSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).stdout;
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function groupByWorkspace(files: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const match = SOURCE_PATTERN.exec(file);
    if (match === null || TEST_PATTERN.test(file)) {
      continue;
    }
    const workspace = `${match[1]}/${match[2]}`;
    if (!existsSync(join(workspace, 'vitest.config.ts'))) {
      continue;
    }
    const relative = file.slice(workspace.length + 1);
    groups.set(workspace, [...(groups.get(workspace) ?? []), relative]);
  }
  return groups;
}

function runStryker(workspace: string, mutate: readonly string[]): number {
  console.log(`\n=== mutation: ${workspace} (${mutate.length} files) ===`);
  const result = spawnSync('bunx', ['stryker', 'run', CONFIG_PATH, '--mutate', mutate.join(',')], {
    cwd: workspace,
    stdio: 'inherit',
    shell: true,
  });
  return result.status ?? 1;
}

const groups = groupByWorkspace(changedFiles());
if (groups.size === 0) {
  console.log('変更された実装ファイルが無いため、ミューテーションテストをスキップします。');
  process.exit(0);
}

const failures = [...groups.entries()]
  .map(([workspace, mutate]) => runStryker(workspace, mutate))
  .filter((status) => status !== 0);

process.exit(failures.length === 0 ? 0 : 1);
