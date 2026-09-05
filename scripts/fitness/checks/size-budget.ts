import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { QUALITY_GATES } from '@seri/quality-gates';

import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';

const NOT_BUILT = -1;

export type SizeBudget = {
  /** Worker 1 本あたりの gzip サイズ */
  readonly apiGzipBytes: number;
  /** SPA の JS 合計の gzip サイズ */
  readonly webGzipBytes: number;
};

function listJsFiles(directory: string): string[] {
  const found: string[] = [];
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      if (statSync(fullPath).isDirectory()) {
        stack.push(fullPath);
      } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
        found.push(fullPath);
      }
    }
  }
  return found;
}

/** 配信されるのは圧縮後のサイズなので gzip 後で測る。 */
function totalGzipBytes(directory: string): number {
  if (!existsSync(directory)) {
    return NOT_BUILT;
  }
  return listJsFiles(directory).reduce(
    (total, file) => total + gzipSync(readFileSync(file)).length,
    0,
  );
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1000).toFixed(1)} kB gzip`;
}

function checkOne(name: string, directory: string, budget: number): CheckResult {
  const bytes = totalGzipBytes(directory);
  if (bytes === NOT_BUILT) {
    // 「計測できなかった」を PASS にすると、クローン直後や dist 削除後に
    // このゲートが常に緑になる（false green）。計測不能は失敗として扱う。
    return {
      name,
      ok: false,
      actual: '未ビルド（計測不能）',
      expected: `<= ${formatBytes(budget)}`,
      details: [`${directory} が存在しない。\`bun run build\` を実行してから計測する`],
    };
  }
  return {
    name,
    ok: bytes <= budget,
    actual: formatBytes(bytes),
    expected: `<= ${formatBytes(budget)}`,
  };
}

/**
 * 適応度関数 ⑧ バンドルサイズ予算。
 * 「依存を足して楽をする」方向への牽制。複雑度やカバレッジを楽に満たすために
 * 巨大なライブラリを持ち込むとここで落ちる。
 *
 * `budget` を引数にしているのは、予算超過の挙動を現実的な大きさの
 * フィクスチャで検証できるようにするため（既定値が単一情報源であることは変わらない）。
 */
export function checkSizeBudget(
  context: FitnessContext = defaultContext(),
  budget: SizeBudget = QUALITY_GATES.sizeBudget,
): CheckResult[] {
  return [
    checkOne('bundle size (api)', join(context.root, 'apps', 'api', 'dist'), budget.apiGzipBytes),
    checkOne('bundle size (web)', join(context.root, 'apps', 'web', 'dist'), budget.webGzipBytes),
  ];
}
