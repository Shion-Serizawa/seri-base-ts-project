import { describe, expect, it } from 'vitest';

import { contextOf, makeTempRepo } from '../../test/temp-repo.ts';
import type { CheckResult } from '../lib/report.ts';
import { checkSizeBudget } from './size-budget.ts';

const GENEROUS = { apiGzipBytes: 10_000, webGzipBytes: 10_000 };
const IMPOSSIBLE = { apiGzipBytes: 1, webGzipBytes: 1 };

const BUILT = {
  'apps/api/dist/worker.js': 'console.log(1);',
  'apps/web/dist/main.js': 'console.log(2);',
};

function resultsOf(files: Readonly<Record<string, string>>, budget = GENEROUS): CheckResult[] {
  return checkSizeBudget(contextOf(makeTempRepo(files)), budget);
}

describe('checkSizeBudget', () => {
  it('api と web の 2 本を見る', () => {
    expect(resultsOf(BUILT).map((result) => result.name)).toStrictEqual([
      'bundle size (api)',
      'bundle size (web)',
    ]);
  });

  it('予算内なら PASS', () => {
    expect(resultsOf(BUILT).every((result) => result.ok)).toBe(true);
  });

  it('予算を超えたら FAIL', () => {
    expect(resultsOf(BUILT, IMPOSSIBLE).every((result) => !result.ok)).toBe(true);
  });

  it('未ビルドは FAIL にする（計測不能を PASS にすると常に緑になる）', () => {
    const results = resultsOf({});

    expect(results.every((result) => !result.ok)).toBe(true);
    expect(results[0]?.actual).toBe('未ビルド（計測不能）');
  });

  it('未ビルドのときはビルド方法を details で案内する', () => {
    expect(resultsOf({})[0]?.details?.[0]).toContain('bun run build');
  });

  it('片方だけ未ビルドならその 1 件だけ FAIL になる', () => {
    const results = resultsOf({ 'apps/api/dist/worker.js': 'console.log(1);' });

    expect(results.map((result) => result.ok)).toStrictEqual([true, false]);
  });

  it('.js と .mjs だけを数え、サブディレクトリも辿る', () => {
    const withAssets = resultsOf({
      ...BUILT,
      'apps/api/dist/nested/chunk.mjs': 'console.log(2);',
      'apps/api/dist/worker.js.map': 'x'.repeat(5000),
      'apps/api/dist/style.css': 'x'.repeat(5000),
    });
    const jsOnly = resultsOf({
      ...BUILT,
      'apps/api/dist/nested/chunk.mjs': 'console.log(2);',
    });

    expect(withAssets[0]?.actual).toBe(jsOnly[0]?.actual);
  });

  it('実測値を kB 単位で表示する', () => {
    expect(resultsOf(BUILT)[0]?.actual).toMatch(/^\d+\.\d kB gzip$/u);
  });

  it('既定の予算は QUALITY_GATES の値を使う', () => {
    const [api] = checkSizeBudget(contextOf(makeTempRepo(BUILT)));

    expect(api?.expected).toBe('<= 550.0 kB gzip');
  });
});
