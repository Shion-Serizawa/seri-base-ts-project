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
 * 適応度関数 ② test ratio。
 * 下限だけだとテストのコピペ膨張で簡単に満たせてしまうため上限も持つ。
 * 上限側は重複率チェック（jscpd）と対で効く。
 */
export function checkTestRatio(): CheckResult {
  const { test, production } = countLines();
  const ratio = production === 0 ? 0 : test / production;
  const { min, max } = QUALITY_GATES.testRatio;

  return {
    name: 'test ratio',
    ok: ratio >= min && ratio <= max,
    actual: ratio.toFixed(2),
    expected: `${min.toFixed(2)} 〜 ${max.toFixed(2)}`,
    details: [`テスト ${test} 行 / 実装 ${production} 行`],
  };
}
