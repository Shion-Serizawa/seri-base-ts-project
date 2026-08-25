import { describe, expect, it } from 'vitest';

import { apiContract } from './todo-contract.ts';

/**
 * 契約の「面」を固定するテスト。
 * 手続きの追加・削除・リネームは意図的な変更のはずなので、ここで気づけるようにする。
 * 入出力の検証そのものは todo.test.ts（スキーマ）と apps/api の統合テストが担う。
 */
describe('apiContract', () => {
  it('公開している名前空間は todo だけ', () => {
    expect(Object.keys(apiContract)).toStrictEqual(['todo']);
  });

  it('todo の手続き一覧が変わっていない', () => {
    expect(Object.keys(apiContract.todo)).toStrictEqual(['list', 'create', 'setDone', 'remove']);
  });
});
