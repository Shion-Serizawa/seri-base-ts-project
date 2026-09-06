import { relative } from 'node:path';

import type { FitnessContext } from '@seri/base-tooling/fitness/context';
import { defaultContext } from '@seri/base-tooling/fitness/context';
import type { CheckResult } from '@seri/base-tooling/fitness/report';
import { listSourceFiles } from '@seri/base-tooling/fitness/walk';

import { DB_REACHABLE_FILES, LAYER_IMPORT_POLICY } from './layer-policy.ts';

const NAME = 'layer targets';
const EXPECTED = '宣言した層のパターンがすべて実ファイルに当たる';
const MAX_DETAIL_LINES = 8;

/**
 * 適応度関数 ⑳ 層のパターンが実ファイルに当たること。
 *
 * ⑦ と ⑭ は `layer-policy.ts` の宣言と `.oxlintrc.json` が**文字列として**一致することしか
 * 見ていない。両方に同じことが書いてあれば、その対象が 1 件も存在しなくても緑になる。
 *
 * これが効くのは、派生リポジトリが最初にやる作業（サンプルの Todo を作るものに置き換える）
 * の途中である。`todo-table.ts` を消した時点で `apps/api/src/repositories/*-table.ts` は
 * 0 件になるが、宣言は両方に残ったままなので ⑦ ⑭ は一致していると言い続ける。
 * **認可スコープの境界が何も守っていない状態が、緑で通る。**
 *
 * A 層の言い方に揃えると「対象 0 件は違反 0 件ではない」。
 * `size-budget` が「dist はあるが JS が 1 本も無い」を FAIL にしているのと同じ型。
 *
 * 第 2 引数を持たせているのは、扱えないパターンの形をテストから渡すため。
 * 判定関数を export すると ⑥′（`knip --production`）が落とす
 * （`scripts/review/route.ts` の `limit` と同じ理由・同じ形）。
 */
export function checkLayerTargets(
  context: FitnessContext = defaultContext(),
  patterns: readonly string[] = declaredPatterns(),
): CheckResult {
  const sources = listSourceFiles(context.root).map((path) =>
    relative(context.root, path).replaceAll('\\', '/'),
  );

  // 走査が空になるのは、リポジトリが空か walk に失敗したとき。
  // 「どのパターンも 0 件」を全件 FAIL として並べても真因が読めないので、先に落とす。
  if (sources.length === 0) {
    return fail('ソースが 0 件', [
      `${context.root} の下に .ts / .tsx が 1 件も無いため、パターンの当たりを判定できません。`,
    ]);
  }

  const dead = patterns.filter((pattern) => !hits(pattern, sources));
  if (dead.length === 0) {
    return {
      name: NAME,
      ok: true,
      actual: `${patterns.length} 件すべて到達`,
      expected: EXPECTED,
    };
  }

  return fail(`${dead.length} 件が 0 件マッチ`, [
    ...dead.slice(0, MAX_DETAIL_LINES).map((pattern) => `  ${pattern}`),
    ...(dead.length > MAX_DETAIL_LINES ? [`  … 他 ${dead.length - MAX_DETAIL_LINES} 件`] : []),
    'layer-policy.ts の宣言か、対象のファイル名を直してください。',
    '宣言だけが残っていると、⑦ ⑭ は一致したまま何も守らなくなります。',
  ]);
}

function fail(actual: string, details: readonly string[]): CheckResult {
  return { name: NAME, ok: false, actual, expected: EXPECTED, details };
}

/** 層の依存方向（⑦）と認可スコープの境界（⑭）が宣言している対象パターン。重複は畳む。 */
function declaredPatterns(): string[] {
  return [
    ...new Set([...LAYER_IMPORT_POLICY.flatMap((rule) => rule.files), ...DB_REACHABLE_FILES]),
  ];
}

function hits(pattern: string, sources: readonly string[]): boolean {
  const match = matcherFor(pattern);
  // 解釈できない形は「当たらない」に倒す。
  // 未知の構文を素通しすると、この検査自体が黙って何も見なくなる。
  return match !== undefined && sources.some((source) => match(source));
}

/**
 * パターンを判定関数に変える。**扱うのは実際に宣言されている 3 つの形だけ**。
 *
 * ここで oxlint のグロブ意味論を推測で再現しない。ずれた分だけこの検査が
 * false green になり、しかも「⑳ が気づかない」という最も追いにくい形で現れる。
 * 未知の形は `undefined` を返して FAIL 側に倒し、扱える形を足すかどうかを人に決めさせる。
 */
function matcherFor(pattern: string): ((source: string) => boolean) | undefined {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -2);
    return (source) => source.startsWith(prefix);
  }
  const cut = pattern.lastIndexOf('/');
  const directory = pattern.slice(0, cut + 1);
  const base = pattern.slice(cut + 1);
  if (directory.includes('*')) {
    // `apps/*/src/lib.ts` のようなディレクトリ側のワイルドカードは未対応
    return undefined;
  }
  return baseMatcher(directory, base);
}

/** ディレクトリ直下のファイル名だけを見る判定。`*` は 1 個まで。 */
function baseMatcher(directory: string, base: string): ((source: string) => boolean) | undefined {
  const star = base.indexOf('*');
  if (star === -1) {
    return (source) => source === `${directory}${base}`;
  }
  if (base.includes('*', star + 1)) {
    return undefined;
  }
  const head = base.slice(0, star);
  const tail = base.slice(star + 1);
  return (source) => {
    if (!source.startsWith(directory)) {
      return false;
    }
    const name = source.slice(directory.length);
    return (
      !name.includes('/') &&
      name.length >= head.length + tail.length &&
      name.startsWith(head) &&
      name.endsWith(tail)
    );
  };
}
