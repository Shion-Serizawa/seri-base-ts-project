import { checkContractErrorDrift } from '../checks/contract-error-drift.ts';
import { checkMigrationSafety } from '../checks/migration-safety.ts';
import { checkOpenApiBreaking } from '../checks/openapi-breaking.ts';
import { checkOpenApiDrift } from '../checks/openapi-drift.ts';
import { checkSchemaDrift } from '../checks/schema-drift.ts';
import type { FitnessContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';

/**
 * このテンプレート固有の構造に依存する検査（ADR 0010 の C 層）。
 *
 * oRPC の契約（`packages/contract/src`）、Drizzle のマイグレーション
 * （`packages/db/migrations`）、生成した `docs/openapi.json` を直接読んでいる。
 * 派生がその構造を捨てれば意味を失うので、`@seri/base-tooling` には移さず
 * リポジトリ側に置いたまま `runFitness` に差し込む。
 *
 * 件数を `run.ts` が宣言している。ここに 1 本足したら `run.ts` も直すことになる
 * （差し込み漏れが「すべて PASS」で通るのを防ぐため）。
 */
export async function collectProjectChecks(context: FitnessContext): Promise<CheckResult[]> {
  return [
    checkSchemaDrift(context),
    await checkOpenApiDrift(context),
    checkOpenApiBreaking(context),
    checkMigrationSafety(context),
    checkContractErrorDrift(context),
  ];
}
