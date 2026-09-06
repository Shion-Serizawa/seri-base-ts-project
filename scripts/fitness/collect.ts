import { collectArtifactChecks } from './groups/artifacts.ts';
import { collectCodebaseChecks } from './groups/codebase.ts';
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
 *
 * 検査は 2 群に分けてある。`groups/codebase.ts` がコードの形と供給網、
 * `groups/artifacts.ts` が生成物・契約・文書の乖離を見る。
 */
export async function collectChecks(
  context: FitnessContext = defaultContext(),
): Promise<CheckResult[]> {
  return [...collectCodebaseChecks(context), ...(await collectArtifactChecks(context))];
}
