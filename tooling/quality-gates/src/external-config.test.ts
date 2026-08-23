import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { QUALITY_GATES } from './index.ts';

function readJsonFile(relativePath: string): unknown {
  const raw = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return JSON.parse(raw.replaceAll(/^\s*\/\/.*$/gmu, ''));
}

const strykerSchema = z.object({
  thresholds: z.object({ high: z.number(), low: z.number(), break: z.number() }),
});

const jscpdSchema = z.object({
  threshold: z.number(),
  minTokens: z.number(),
});

/**
 * しきい値を持つ外部ツールの設定が QUALITY_GATES と一致していることを検証する。
 * 設定ファイル側だけを緩めて適応度関数を骨抜きにする、という抜け道を塞ぐ。
 */
describe('外部ツールのしきい値が QUALITY_GATES と一致している', () => {
  it('stryker.config.json', () => {
    const stryker = strykerSchema.parse(readJsonFile('../../../stryker.config.json'));
    expect(stryker.thresholds).toStrictEqual({
      high: QUALITY_GATES.mutation.high,
      low: QUALITY_GATES.mutation.low,
      break: QUALITY_GATES.mutation.break,
    });
  });

  it('.jscpd.json', () => {
    const jscpd = jscpdSchema.parse(readJsonFile('../../../.jscpd.json'));
    expect(jscpd.threshold).toBe(QUALITY_GATES.duplication.maxPercentTokens);
    expect(jscpd.minTokens).toBe(QUALITY_GATES.duplication.minTokens);
  });
});
