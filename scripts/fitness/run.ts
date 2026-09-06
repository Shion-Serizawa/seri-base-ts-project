import { runFitness } from '@seri/base-tooling/fitness';

import { collectProjectChecks } from './project/checks.ts';

/**
 * `project/checks.ts` が返す結果の件数。ここと実際がずれたら FAIL する。
 * 検査を足したらこの数字も直すことになる（差し込み漏れを黙って通さないため）。
 */
const EXPECTED_PROJECT_RESULTS = 6;

const passed = await runFitness({
  projectChecks: [collectProjectChecks],
  expectedProjectResults: EXPECTED_PROJECT_RESULTS,
});
process.exit(passed ? 0 : 1);
