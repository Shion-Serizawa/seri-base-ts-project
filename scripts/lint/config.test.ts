import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { makeTempRepo } from '../test/temp-repo.ts';

const configPath = fileURLToPath(new URL('../../.oxlintrc.json', import.meta.url));
const cliPath = fileURLToPath(new URL('../../node_modules/oxlint/bin/oxlint', import.meta.url));

function lintSource(source: string): { status: number | null; output: string } {
  const root = makeTempRepo({
    'example.ts': source,
    'tsconfig.json': JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2023', noEmit: true },
      include: ['example.ts'],
    }),
  });
  const result = spawnSync(
    process.execPath,
    [cliPath, '--config', configPath, '--type-aware', join(root, 'example.ts')],
    { cwd: root, encoding: 'utf8', timeout: 20_000 },
  );
  expect(result.error).toBeUndefined();
  return { status: result.status, output: result.stdout + result.stderr };
}

describe('実際の Linter が品質違反を拒否する', () => {
  it.each([
    [
      'no-param-reassign',
      'export function change(value: { count: number }): void { value.count = 1; }',
    ],
    ['no-empty-object-type', 'export type Value = {};'],
    ['no-floating-promises', 'void Promise.reject(new Error("失敗"));'],
    [
      'strict-boolean-expressions',
      'export function present(value: string): boolean { return value ? true : false; }',
    ],
    [
      'use-unknown-in-catch-callback-variable',
      'Promise.resolve(1).catch((error) => { console.error(error); });',
    ],
  ])('%s を終了コード 1 で検出する', (rule, source) => {
    const result = lintSource(source);
    expect(result.status).toBe(1);
    expect(result.output).toContain(rule);
  });

  it('不要な抑制コメントを拒否する', () => {
    const result = lintSource('// oxlint-disable-next-line no-alert\nexport const value = 1;');
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/unused.+disable/iu);
  });

  it('明示的な条件と処理済みの Promise は許可する', () => {
    const result = lintSource(
      [
        'export function present(value: string): boolean { return value.length > 0; }',
        'await Promise.resolve(1).catch((error: unknown) => { console.error(error); });',
      ].join('\n'),
    );
    expect(result.status).toBe(0);
  });
});
