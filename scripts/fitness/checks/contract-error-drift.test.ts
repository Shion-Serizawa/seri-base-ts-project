import { describe, expect, it } from 'vitest';

import { contextOf, makeTempRepo } from '../../test/temp-repo.ts';
import { checkContractErrorDrift } from './contract-error-drift.ts';

const CONTRACT = 'packages/contract/src/todo-contract.ts';
const ROUTER = 'apps/api/src/rpc/router.ts';

/** 2 種のエラーを宣言する契約。入れ子の `message` を含む実際の形に寄せてある。 */
const contractWith = (codes: readonly string[]): string => `
const authenticated = oc.errors({
  UNAUTHORIZED: { message: '認証が必要です' },
});
const todoContract = {
  setDone: authenticated.errors({
${codes.map((code) => `    ${code}: { message: '${code}' },`).join('\n')}
  }),
};
`;

const routerThrowing = (codes: readonly string[]): string => `
const handler = () => {
${codes.map((code) => `  throw errors.${code}();`).join('\n')}
};
`;

describe('checkContractErrorDrift', () => {
  it('契約のエラーをすべて送出していれば PASS', () => {
    const root = makeTempRepo({
      [CONTRACT]: contractWith(['NOT_FOUND', 'BLANK_TITLE']),
      [ROUTER]: routerThrowing(['UNAUTHORIZED', 'NOT_FOUND', 'BLANK_TITLE']),
    });

    const result = checkContractErrorDrift(contextOf(root));

    expect(result.ok).toBe(true);
    expect(result.actual).toBe('3 種すべて送出');
  });

  it('送出されないエラーがあれば FAIL になり、どのエラーかを示す', () => {
    const root = makeTempRepo({
      [CONTRACT]: contractWith(['NOT_FOUND', 'CONFLICT']),
      [ROUTER]: routerThrowing(['UNAUTHORIZED', 'NOT_FOUND']),
    });

    const result = checkContractErrorDrift(contextOf(root));

    expect(result.ok).toBe(false);
    expect(result.details?.[0]).toContain('CONFLICT');
  });

  it('テストコードでの送出は実装として数えない', () => {
    // ここを数えると、`router.test.ts` にエラーを書いただけで緑になる
    const root = makeTempRepo({
      [CONTRACT]: contractWith(['CONFLICT']),
      [ROUTER]: routerThrowing(['UNAUTHORIZED']),
      'apps/api/src/rpc/router.test.ts': routerThrowing(['CONFLICT']),
    });

    const result = checkContractErrorDrift(contextOf(root));

    expect(result.ok).toBe(false);
    expect(result.details?.[0]).toContain('CONFLICT');
  });

  it('契約のソースが無ければ FAIL になり、復旧手順を示す', () => {
    const root = makeTempRepo({ [ROUTER]: routerThrowing(['UNAUTHORIZED']) });

    const result = checkContractErrorDrift(contextOf(root));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('対象なし（計測不能）');
    expect(result.details?.join('\n')).toContain('検査側も直す');
  });

  it('api のソースが無ければ FAIL になる', () => {
    const root = makeTempRepo({ [CONTRACT]: contractWith(['NOT_FOUND']) });

    const result = checkContractErrorDrift(contextOf(root));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('対象なし（計測不能）');
  });

  it('契約にエラー宣言が 1 つも無ければ FAIL になる（記法変更で黙らない）', () => {
    const root = makeTempRepo({
      [CONTRACT]: 'const todoContract = { list: oc.output(schema) };\n',
      [ROUTER]: routerThrowing(['UNAUTHORIZED']),
    });

    const result = checkContractErrorDrift(contextOf(root));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('エラー宣言 0 件（計測不能）');
  });
});
