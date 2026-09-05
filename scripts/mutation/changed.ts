import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { RunCommand } from '../fitness/lib/exec.ts';

const SOURCE_PATTERN = /^(apps|packages)\/([^/]+)\/src\/.+\.tsx?$/u;
const TEST_PATTERN = /\.(?:test|spec)\.tsx?$/u;

/** ワークスペースがミューテーションテストの対象になりうるか（vitest 設定があるか）。 */
export type HasVitestConfig = (workspace: string) => boolean;

function hasVitestConfig(workspace: string): boolean {
  return existsSync(join(workspace, 'vitest.config.ts'));
}

/**
 * ベースブランチとの差分ファイルを列挙する。
 * ベースが解決できない環境（浅いクローン等）では作業ツリーの差分に落とす。
 */
export function changedFiles(run: RunCommand, baseRef: string): string[] {
  const ranged = run(`git diff --name-only ${baseRef}...HEAD`);
  const output = ranged.status === 0 ? ranged.stdout : run('git diff --name-only HEAD').stdout;
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * 差分ファイルを「ワークスペース → そこからの相対パス」に振り分ける。
 *
 * テストファイル自身と、src 配下でないもの（設定・マイグレーション等）は対象外。
 * ミューテーションはテストの厳しさを測る指標なので、テストを変えただけでは走らせない。
 */
export function groupByWorkspace(
  files: readonly string[],
  exists: HasVitestConfig = hasVitestConfig,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const match = SOURCE_PATTERN.exec(file);
    if (match === null || TEST_PATTERN.test(file)) {
      continue;
    }
    const workspace = `${match[1]}/${match[2]}`;
    if (!exists(workspace)) {
      continue;
    }
    groups.set(workspace, [...(groups.get(workspace) ?? []), file.slice(workspace.length + 1)]);
  }
  return groups;
}
