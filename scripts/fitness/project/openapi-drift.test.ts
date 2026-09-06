import { contextOf, makeTempRepo } from '@seri/base-tooling/test';
import { describe, expect, it } from 'vitest';

import {
  buildOpenApiDocument,
  OPENAPI_SPEC_PATH,
  serializeOpenApiDocument,
} from '../../openapi/document.ts';
import { checkOpenApiDrift } from './openapi-drift.ts';

async function currentSpec(): Promise<string> {
  return serializeOpenApiDocument(await buildOpenApiDocument());
}

describe('checkOpenApiDrift', () => {
  it('契約から生成した内容と一致すれば PASS', async () => {
    const root = makeTempRepo({ [OPENAPI_SPEC_PATH]: await currentSpec() });

    const result = await checkOpenApiDrift(contextOf(root));

    expect(result.ok).toBe(true);
    expect(result.actual).toBe('一致');
  });

  it('ドキュメントが未生成なら FAIL にして生成方法を案内する', async () => {
    const result = await checkOpenApiDrift(contextOf(makeTempRepo({})));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('未生成');
    expect(result.details?.[0]).toContain('bun run openapi:generate');
  });

  it('契約を変えて再生成し忘れた状態を検出する', async () => {
    const stale = (await currentSpec()).replace('"title": "seri-base API"', '"title": "old"');
    const root = makeTempRepo({ [OPENAPI_SPEC_PATH]: stale });

    const result = await checkOpenApiDrift(contextOf(root));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('契約と乖離');
  });

  it('コミット済みが途中で切れている場合も乖離として検出する', async () => {
    const truncated = (await currentSpec()).split('\n').slice(0, 3).join('\n');
    const root = makeTempRepo({ [OPENAPI_SPEC_PATH]: truncated });

    const result = await checkOpenApiDrift(contextOf(root));

    expect(result.ok).toBe(false);
    expect(result.details?.some((line) => line.includes('(行なし)'))).toBe(true);
  });

  it('乖離しているときは差分の位置を details に出す', async () => {
    const stale = (await currentSpec()).replace('"title": "seri-base API"', '"title": "old"');
    const root = makeTempRepo({ [OPENAPI_SPEC_PATH]: stale });

    const result = await checkOpenApiDrift(contextOf(root));

    expect(result.details?.some((line) => line.includes('行目から差分'))).toBe(true);
  });
});
