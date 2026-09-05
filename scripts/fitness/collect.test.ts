import { describe, expect, it } from 'vitest';

import {
  buildOpenApiDocument,
  OPENAPI_SPEC_PATH,
  serializeOpenApiDocument,
} from '../openapi/document.ts';
import { contextOf, makeTempRepo, stubRun } from '../test/temp-repo.ts';
import { collectChecks } from './collect.ts';
import type { CommandOutcome } from './lib/exec.ts';

const jscpdFails = (command: string): Partial<CommandOutcome> =>
  command.includes('jscpd') ? { status: 1 } : { status: 0 };

const SHA = 'a'.repeat(40);

/** すべての検査が PASS になる擬似リポジトリ。 */
async function healthyRoot(): Promise<string> {
  return makeTempRepo({
    'package.json': JSON.stringify({ name: 'root', devDependencies: { knip: '6.32.2' } }),
    'bunfig.toml': '[install]\nexact = true\nminimumReleaseAge = 604800\n',
    'bun.lock': '',
    'mise.lock': '',
    '.github/workflows/ci.yml': `      - uses: actions/checkout@${SHA}\n`,
    'apps/api/dist/worker.js': 'console.log(1);',
    'apps/web/dist/main.js': 'console.log(2);',
    'packages/domain/src/todo.ts': 'const a = 1;\n',
    [OPENAPI_SPEC_PATH]: serializeOpenApiDocument(await buildOpenApiDocument()),
  });
}

describe('collectChecks', () => {
  it('健全なリポジトリではすべての検査が PASS になる', async () => {
    const results = await collectChecks(contextOf(await healthyRoot()));

    expect(results.filter((result) => !result.ok)).toEqual([]);
  });

  it('12 本の検査を返す', async () => {
    const results = await collectChecks(contextOf(await healthyRoot()));

    expect(results.map((result) => result.name)).toEqual([
      'test ratio',
      'dead code (knip)',
      'dead code (production)',
      'duplication (jscpd)',
      'bundle size (api)',
      'bundle size (web)',
      'dependency pinning',
      'install policy',
      'actions pinning',
      'secret scan',
      'schema drift',
      'openapi drift',
    ]);
  });

  it('検査名が重複しない（レポートで取り違えない）', async () => {
    const names = (await collectChecks(contextOf(await healthyRoot()))).map(
      (result) => result.name,
    );

    expect(new Set(names).size).toBe(names.length);
  });

  it('1 つでも壊れていれば、その検査だけが FAIL になる', async () => {
    const root = await healthyRoot();
    const run = stubRun(jscpdFails);

    const failed = (await collectChecks(contextOf(root, run))).filter((result) => !result.ok);

    expect(failed.map((result) => result.name)).toEqual(['duplication (jscpd)']);
  });

  it('外部コマンドを実際に起動せずに全検査が走る（root の外に触れない）', async () => {
    const run = stubRun();

    await collectChecks(contextOf(await healthyRoot(), run));

    expect(run.calls.length).toBeGreaterThan(0);
  });
});
