import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { QUALITY_GATES } from '@seri/quality-gates';

import type { CheckResult } from '../lib/report.ts';

const NOT_BUILT = -1;

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
    return {
      name,
      ok: true,
      actual: '未ビルド',
      expected: `<= ${formatBytes(budget)}`,
      details: [`${directory} が無いためスキップ（bun run build 後に再実行）`],
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
 */
export function checkSizeBudget(): CheckResult[] {
  return [
    checkOne(
      'bundle size (api)',
      join('apps', 'api', 'dist'),
      QUALITY_GATES.sizeBudget.apiGzipBytes,
    ),
    checkOne(
      'bundle size (web)',
      join('apps', 'web', 'dist'),
      QUALITY_GATES.sizeBudget.webGzipBytes,
    ),
  ];
}
