import { checkContextDrift } from './checks/context-drift.ts';
import { checkExternalTools } from './checks/external-tools.ts';
import { checkOpenApiDrift } from './checks/openapi-drift.ts';
import { checkSchemaDrift } from './checks/schema-drift.ts';
import { checkSecretScan } from './checks/secret-scan.ts';
import { checkSizeBudget } from './checks/size-budget.ts';
import { checkSupplyChain } from './checks/supply-chain.ts';
import { checkTestRatio } from './checks/test-ratio.ts';
import type { FitnessContext } from './lib/context.ts';
import { defaultContext } from './lib/context.ts';
import type { CheckResult } from './lib/report.ts';

/**
 * 適応度関数の一括実行。
 *
 * カバレッジ（①）と複雑度（⑤）とアーキテクチャ境界（⑦）は
 * それぞれ vitest / oxlint 側で強制しているためここには含めない。
 * 含めているのは、それらの指標をハックした場合に悪化する側の指標と、
 * 型でもテストでも守れない性質のもの（依存の固定・シークレット・生成物の乖離）。
 */
export async function collectChecks(
  context: FitnessContext = defaultContext(),
): Promise<CheckResult[]> {
  return [
    checkTestRatio(context),
    ...checkExternalTools(context),
    ...checkSizeBudget(context),
    ...checkSupplyChain(context),
    checkSecretScan(context),
    checkSchemaDrift(context),
    await checkOpenApiDrift(context),
    checkContextDrift(context),
  ];
}
