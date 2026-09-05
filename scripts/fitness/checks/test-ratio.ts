import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { QUALITY_GATES } from '@seri/quality-gates';

import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';
import { countEffectiveLines, isTestFile, listSourceFiles } from '../lib/walk.ts';

const ROOTS = ['apps', 'packages', 'tooling', 'scripts'];

type Counts = { test: number; production: number };

function emptyCounts(): Counts {
  return { test: 0, production: 0 };
}

function ratioOf({ test, production }: Counts): number {
  return production === 0 ? 0 : test / production;
}

function countInto(byWorkspace: Map<string, Counts>, workspace: string, directory: string): void {
  const counts = byWorkspace.get(workspace) ?? emptyCounts();
  for (const file of listSourceFiles(directory)) {
    const lines = countEffectiveLines(file);
    if (isTestFile(file)) {
      counts.test += lines;
    } else {
      counts.production += lines;
    }
  }
  if (counts.test + counts.production > 0) {
    byWorkspace.set(workspace, counts);
  }
}

/**
 * ワークスペース単位（`apps/api` など）と全体の行数を数える。
 *
 * `scripts` はワークスペースに分かれていないのでまとめて 1 つとして扱う。
 * それ以外は「領域の直下のディレクトリ = 1 ワークスペース」で数える
 * （ファイルパスから推測するとパス区切りの扱いで環境差が出るため）。
 */
function countByWorkspace(root: string): Map<string, Counts> {
  const byWorkspace = new Map<string, Counts>();
  for (const area of ROOTS.filter((name) => name !== 'scripts')) {
    const areaPath = join(root, area);
    if (!existsSync(areaPath)) {
      continue;
    }
    for (const entry of readdirSync(areaPath)) {
      countInto(byWorkspace, `${area}/${entry}`, join(areaPath, entry));
    }
  }
  countInto(byWorkspace, 'scripts', join(root, 'scripts'));
  return byWorkspace;
}

/**
 * 適応度関数 ② test ratio（上限のみ）。
 *
 * テストのコピペ膨張・過剰なテスト量への牽制。③ 重複率と対で効く。
 * 下限を置かない理由は QUALITY_GATES.testRatio のコメントを参照。
 * 「テストが足りない」側は per-file カバレッジとミューテーションスコアが検出する。
 *
 * 全体の 1 つの数値だけでは「どこが厚い／薄いのか」が分からないため、
 * ワークスペース単位でも出す（判定は各ワークスペースに対して行う）。
 */
export function checkTestRatio(context: FitnessContext = defaultContext()): CheckResult {
  const byWorkspace = [...countByWorkspace(context.root).entries()].toSorted(([a], [b]) =>
    a.localeCompare(b),
  );
  const total = byWorkspace.reduce<Counts>(
    (acc, [, counts]) => ({
      test: acc.test + counts.test,
      production: acc.production + counts.production,
    }),
    emptyCounts(),
  );
  const { max } = QUALITY_GATES.testRatio;
  const over = byWorkspace.filter(([, counts]) => ratioOf(counts) > max);

  return {
    name: 'test ratio',
    ok: over.length === 0,
    actual: ratioOf(total).toFixed(2),
    expected: `各ワークスペース <= ${max.toFixed(2)}`,
    details: byWorkspace.map(
      ([workspace, counts]) =>
        `${workspace.padEnd(22)} ${ratioOf(counts).toFixed(2)}  (テスト ${counts.test} 行 / 実装 ${counts.production} 行)`,
    ),
  };
}
