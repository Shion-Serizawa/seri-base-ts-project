import { QUALITY_GATES } from '@seri/quality-gates';

import type { CheckResult } from '../lib/report.ts';
import { countEffectiveLines, isTestFile, listSourceFiles } from '../lib/walk.ts';

const ROOTS = ['apps', 'packages', 'tooling', 'scripts'];

type Counts = { test: number; production: number };

function countLines(): Counts {
  const counts: Counts = { test: 0, production: 0 };
  for (const root of ROOTS) {
    for (const file of listSourceFiles(root)) {
      const lines = countEffectiveLines(file);
      if (isTestFile(file)) {
        counts.test += lines;
      } else {
        counts.production += lines;
      }
    }
  }
  return counts;
}

/**
 * 適応度関数 ② test ratio（上限のみ）。
 *
 * テストのコピペ膨張・過剰なテスト量への牽制。③ 重複率と対で効く。
 * 下限を置かない理由は QUALITY_GATES.testRatio のコメントを参照。
 * 「テストが足りない」側は per-file カバレッジとミューテーションスコアが検出する。
 */
export function checkTestRatio(): CheckResult {
  const { test, production } = countLines();
  const ratio = production === 0 ? 0 : test / production;
  const { max } = QUALITY_GATES.testRatio;

  return {
    name: 'test ratio',
    ok: ratio <= max,
    actual: ratio.toFixed(2),
    expected: `<= ${max.toFixed(2)}`,
    details: [`テスト ${test} 行 / 実装 ${production} 行（下限は設けない）`],
  };
}
