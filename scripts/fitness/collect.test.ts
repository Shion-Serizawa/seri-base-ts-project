import { describe, expect, it } from 'vitest';

import {
  buildOpenApiDocument,
  OPENAPI_SPEC_PATH,
  serializeOpenApiDocument,
} from '../openapi/document.ts';
import { contextOf, makeTempRepo, stubRun } from '../test/temp-repo.ts';
import { collectChecks } from './collect.ts';
import type { CommandOutcome } from './lib/exec.ts';

/**
 * 健全な既定の外部コマンド応答。
 *
 * ⑯ は基準リビジョンの `docs/openapi.json` を git から取り出すので、
 * 「基準にはまだ無い（初回生成）」を返させる。すべて status 0 で空出力を返すと、
 * 空文字列を JSON として読もうとして ⑯ だけが FAIL する。
 */
const baseReply = (command: string): Partial<CommandOutcome> =>
  command.startsWith('git cat-file') ? { status: 1 } : { status: 0 };

const healthyRun = (): ReturnType<typeof stubRun> => stubRun(baseReply);

const jscpdFails = (command: string): Partial<CommandOutcome> =>
  command.includes('jscpd') ? { status: 1 } : baseReply(command);

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
    'CLAUDE.md': '`packages/domain/src/todo.ts` を見る。\n',
    // ⑮ 契約エラーの乖離: 契約が宣言したエラーを実装が送出している状態
    'packages/contract/src/todo-contract.ts':
      "const c = oc.errors({ UNAUTHORIZED: { message: '認証が必要です' } });\n",
    'apps/api/src/rpc/router.ts': 'const h = () => { throw errors.UNAUTHORIZED(); };\n',
    // ⑰ 破壊的マイグレーション: 破壊的な文を含まないマイグレーション
    'packages/db/migrations/0000_init.sql': 'CREATE TABLE `todo` (`id` text NOT NULL);',
    [OPENAPI_SPEC_PATH]: serializeOpenApiDocument(await buildOpenApiDocument()),
  });
}

describe('collectChecks', () => {
  it('健全なリポジトリではすべての検査が PASS になる', async () => {
    const results = await collectChecks(contextOf(await healthyRoot(), healthyRun()));

    expect(results.filter((result) => !result.ok)).toStrictEqual([]);
  });

  it('16 本の検査を返す', async () => {
    const results = await collectChecks(contextOf(await healthyRoot(), healthyRun()));

    expect(results.map((result) => result.name)).toStrictEqual([
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
      'openapi breaking',
      'migration safety',
      'contract error drift',
      'context drift',
    ]);
  });

  it('検査名が重複しない（レポートで取り違えない）', async () => {
    const names = (await collectChecks(contextOf(await healthyRoot(), healthyRun()))).map(
      (result) => result.name,
    );

    expect(new Set(names).size).toBe(names.length);
  });

  it('1 つでも壊れていれば、その検査だけが FAIL になる', async () => {
    const root = await healthyRoot();
    const run = stubRun(jscpdFails);

    const failed = (await collectChecks(contextOf(root, run))).filter((result) => !result.ok);

    expect(failed.map((result) => result.name)).toStrictEqual(['duplication (jscpd)']);
  });

  it('外部コマンドを実際に起動せずに全検査が走る（root の外に触れない）', async () => {
    const run = stubRun();

    await collectChecks(contextOf(await healthyRoot(), run));

    expect(run.calls.length).toBeGreaterThan(0);
  });
});
