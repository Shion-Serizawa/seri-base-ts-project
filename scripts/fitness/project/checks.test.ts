import type { CommandOutcome } from '@seri/base-tooling/fitness/exec';
import { contextOf, makeTempRepo, repositoryConfigFiles, stubRun } from '@seri/base-tooling/test';
import { describe, expect, it } from 'vitest';

import {
  buildOpenApiDocument,
  OPENAPI_SPEC_PATH,
  serializeOpenApiDocument,
} from '../../openapi/document.ts';
import { collectProjectChecks } from './checks.ts';

/**
 * 健全な既定の外部コマンド応答。
 *
 * ⑯ は基準リビジョンの `docs/openapi.json` を git から取り出すので、
 * 「基準にはまだ無い（初回生成）」を返させる。すべて status 0 で空出力を返すと、
 * 空文字列を JSON として読もうとして ⑯ だけが FAIL する。
 */
const baseReply = (command: string): Partial<CommandOutcome> =>
  command.startsWith('git cat-file') ? { status: 1 } : { status: 0 };

/** このテンプレートの形（契約・スキーマ・生成物）を備えた擬似リポジトリ。 */
async function healthyRoot(): Promise<string> {
  return makeTempRepo({
    ...repositoryConfigFiles(),
    'package.json': JSON.stringify({ name: 'root' }),
    // ⑮ 契約エラーの乖離: 契約が宣言したエラーを実装が送出している状態
    'packages/contract/src/todo-contract.ts':
      "const c = oc.errors({ UNAUTHORIZED: { message: '認証が必要です' } });\n",
    'apps/api/src/rpc/router.ts': 'const h = () => { throw errors.UNAUTHORIZED(); };\n',
    // ⑰ 破壊的マイグレーション: 破壊的な文を含まないマイグレーション
    'packages/db/migrations/0000_init.sql': 'CREATE TABLE `todo` (`id` text NOT NULL);',
    // ⑳ 層のパターンの到達: 宣言した対象がすべて 1 件以上存在する状態
    ...layerTargetFiles(),
    [OPENAPI_SPEC_PATH]: serializeOpenApiDocument(await buildOpenApiDocument()),
  });
}

/**
 * `layer-policy.ts` が宣言している対象を 1 件ずつ満たすファイル。
 *
 * ⑳ は「宣言したパターンが実ファイルに当たるか」を見るので、これが無いと
 * 健全な擬似リポジトリでも FAIL する。落ちたときに検査の実装を疑う前に、
 * ここの不足を疑うこと。
 */
function layerTargetFiles(): Record<string, string> {
  return {
    'packages/contract/src/todo.ts': 'export const a = 1;\n',
    'packages/domain/src/todo.ts': 'export const a = 1;\n',
    'packages/db/src/schema.ts': 'export const a = 1;\n',
    'apps/api/src/lib/auth.ts': 'export const a = 1;\n',
    'apps/api/src/repositories/todo-table.ts': 'export const a = 1;\n',
    'apps/web/src/main.ts': 'export const a = 1;\n',
  };
}

describe('collectProjectChecks', () => {
  it('健全なリポジトリではすべての検査が PASS になる', async () => {
    const results = await collectProjectChecks(contextOf(await healthyRoot(), stubRun(baseReply)));

    expect(results.filter((result) => !result.ok)).toStrictEqual([]);
  });

  it('リポジトリの形に依存する 7 本の検査を返す', async () => {
    const results = await collectProjectChecks(contextOf(await healthyRoot(), stubRun(baseReply)));

    expect(results.map((result) => result.name)).toStrictEqual([
      'schema drift',
      'openapi drift',
      'openapi breaking',
      'migration safety',
      'contract error drift',
      'layer boundary',
      'layer targets',
    ]);
  });

  it('生成物が乖離していれば、その検査だけが FAIL になる', async () => {
    const root = makeTempRepo({
      ...repositoryConfigFiles(),
      'package.json': JSON.stringify({ name: 'root' }),
      'packages/contract/src/todo-contract.ts':
        "const c = oc.errors({ UNAUTHORIZED: { message: '認証が必要です' } });\n",
      'apps/api/src/rpc/router.ts': 'const h = () => { throw errors.UNAUTHORIZED(); };\n',
      'packages/db/migrations/0000_init.sql': 'CREATE TABLE `todo` (`id` text NOT NULL);',
      ...layerTargetFiles(),
      [OPENAPI_SPEC_PATH]: '{"openapi":"3.1.1"}',
    });

    const failed = (await collectProjectChecks(contextOf(root, stubRun(baseReply)))).filter(
      (result) => !result.ok,
    );

    expect(failed.map((result) => result.name)).toStrictEqual(['openapi drift']);
  });
});
