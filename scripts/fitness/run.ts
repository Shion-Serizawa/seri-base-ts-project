import { checkExternalTools } from './checks/external-tools.ts';
import { checkSizeBudget } from './checks/size-budget.ts';
import { checkSupplyChain } from './checks/supply-chain.ts';
import { checkTestRatio } from './checks/test-ratio.ts';
import type { CheckResult } from './lib/report.ts';
import { printReport } from './lib/report.ts';

/**
 * 適応度関数の一括実行。
 *
 * カバレッジ（①）と複雑度（⑤）はそれぞれ vitest / oxlint 側で強制しているため
 * ここには含めない。含めているのは、それらの指標をハックした場合に悪化する側の指標。
 */
function collect(): CheckResult[] {
  return [checkTestRatio(), ...checkExternalTools(), ...checkSizeBudget(), ...checkSupplyChain()];
}

const passed = printReport(collect());
process.exit(passed ? 0 : 1);
