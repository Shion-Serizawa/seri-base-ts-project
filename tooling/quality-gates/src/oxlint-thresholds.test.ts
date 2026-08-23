import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { QUALITY_GATES } from './index.ts';

const oxlintRcSchema = z.object({
  rules: z.record(z.string(), z.unknown()),
});

function loadOxlintRules(): Record<string, unknown> {
  const raw = readFileSync(new URL('../../../.oxlintrc.json', import.meta.url), 'utf8');
  // .oxlintrc.json は JSONC（コメント可）なので、行コメントを落としてから解析する
  const withoutComments = raw.replaceAll(/^\s*\/\/.*$/gmu, '');
  return oxlintRcSchema.parse(JSON.parse(withoutComments)).rules;
}

/**
 * oxlint のしきい値は .oxlintrc.json 側にしか書けないため、
 * QUALITY_GATES との乖離をここで検出する。
 */
describe('oxlint のしきい値が QUALITY_GATES と一致している', () => {
  const rules = loadOxlintRules();
  const { complexity } = QUALITY_GATES;

  it('complexity', () => {
    expect(rules['complexity']).toStrictEqual(['error', { max: complexity.max }]);
  });

  it('max-depth', () => {
    expect(rules['max-depth']).toStrictEqual(['error', complexity.maxDepth]);
  });

  it('max-params', () => {
    expect(rules['max-params']).toStrictEqual(['error', complexity.maxParams]);
  });

  it('max-statements', () => {
    expect(rules['max-statements']).toStrictEqual(['error', complexity.maxStatements]);
  });

  it('max-nested-callbacks', () => {
    expect(rules['max-nested-callbacks']).toStrictEqual(['error', complexity.maxNestedCallbacks]);
  });

  it('max-lines-per-function', () => {
    expect(rules['max-lines-per-function']).toStrictEqual([
      'error',
      { max: complexity.maxLinesPerFunction, skipBlankLines: true, skipComments: true },
    ]);
  });

  it('max-lines', () => {
    expect(rules['max-lines']).toStrictEqual([
      'error',
      { max: complexity.maxLines, skipBlankLines: true, skipComments: true },
    ]);
  });
});
