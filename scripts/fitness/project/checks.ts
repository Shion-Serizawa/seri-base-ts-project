import type { FitnessContext } from '@seri/base-tooling/fitness/context';
import type { CheckResult } from '@seri/base-tooling/fitness/report';

import { checkContractErrorDrift } from './contract-error-drift.ts';
import { checkLayerBoundary } from './layer-boundary.ts';
import { checkMigrationSafety } from './migration-safety.ts';
import { checkOpenApiBreaking } from './openapi-breaking.ts';
import { checkOpenApiDrift } from './openapi-drift.ts';
import { checkSchemaDrift } from './schema-drift.ts';

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
    ...checkLayerBoundary(context),
  ];
}
