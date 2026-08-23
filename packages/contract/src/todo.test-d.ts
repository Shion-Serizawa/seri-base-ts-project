import type { ContractRouterClient } from '@orpc/contract';
import { describe, expectTypeOf, it } from 'vitest';

import type { apiContract } from './todo-contract.ts';
import type { CreateTodoInput, Todo, TodoId } from './todo.ts';

type Client = ContractRouterClient<typeof apiContract>;
type SetDoneInput = Parameters<Client['todo']['setDone']>[0];
type SetDoneOutput = Awaited<ReturnType<Client['todo']['setDone']>>;

/**
 * 型そのものの検査。実行時テストでは検出できない「型が緩くなる」方向の退化を止める。
 * branded type を外す、入力型を広げる、といった変更はここで落ちる。
 */
describe('TodoId', () => {
  it('生の string を代入できない（branded type が効いている）', () => {
    expectTypeOf<string>().not.toExtend<TodoId>();
  });

  it('string としては扱える', () => {
    expectTypeOf<TodoId>().toExtend<string>();
  });

  it('Todo.id は TodoId である', () => {
    expectTypeOf<Todo['id']>().toEqualTypeOf<TodoId>();
  });
});

describe('CreateTodoInput', () => {
  it('title だけを持つ', () => {
    expectTypeOf<CreateTodoInput>().toEqualTypeOf<{ title: string }>();
  });
});

describe('契約から生成されるクライアント', () => {
  it('list は Todo の配列を返す', () => {
    expectTypeOf<Awaited<ReturnType<Client['todo']['list']>>>().toEqualTypeOf<Todo[]>();
  });

  it('create は title を要求する', () => {
    expectTypeOf<Client['todo']['create']>().parameter(0).toExtend<{ title: string }>();
  });

  /**
   * zod の `.brand()` は**出力側**にしか型を付けない（`z.input` は生の string のまま）。
   * したがってクライアントの引数には生の string を渡せる。
   * branded type が守っているのは「サーバやクライアントが受け取った id を
   * 他の string と混同すること」であって、呼び出し時の入力ではない。
   * この非対称性は分かりにくいので、事実として型テストに固定しておく。
   */
  it('setDone の入力 id は string（brand は入力側には付かない）', () => {
    expectTypeOf<SetDoneInput>().toEqualTypeOf<{ id: string; done: boolean }>();
  });

  it('setDone の戻り値の id は TodoId になっている', () => {
    expectTypeOf<SetDoneOutput['id']>().toEqualTypeOf<TodoId>();
  });
});
