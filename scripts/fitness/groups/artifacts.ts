import { checkContextDrift } from '../checks/context-drift.ts';
import { checkContractErrorDrift } from '../checks/contract-error-drift.ts';
import { checkMigrationSafety } from '../checks/migration-safety.ts';
import { checkOpenApiBreaking } from '../checks/openapi-breaking.ts';
import { checkOpenApiDrift } from '../checks/openapi-drift.ts';
import { checkSchemaDrift } from '../checks/schema-drift.ts';
import type { FitnessContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';

/**
 * 生成物・契約・文書が実物と乖離していないかを見る検査。
 *
 * いずれも「型検査もテストも通るのに、公開している情報だけが古い」という
 * 形で壊れる。lint も型も見ない領域なので直接見るしかない。
 */
export async function collectArtifactChecks(context: FitnessContext): Promise<CheckResult[]> {
  return [
    checkSchemaDrift(context),
    await checkOpenApiDrift(context),
    checkOpenApiBreaking(context),
    checkMigrationSafety(context),
    checkContractErrorDrift(context),
    checkContextDrift(context),
  ];
}
