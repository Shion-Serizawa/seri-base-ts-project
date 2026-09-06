import type { Todo, TodoId } from '@seri/contract';
import { todoSchema } from '@seri/contract';

import type { Bindings } from '../env.ts';
import { ownedTodos } from './todo-table.ts';

/**
 * セッションのユーザーに束縛済みの Todo 操作。
 *
 * 生成時に `userId` を閉じ込めるので、各操作の引数に `userId` は現れない。
 * 他人の Todo に対する更新・削除は「見つからない」（`undefined` / `false`）として扱う。
 * 403 を返すと id の存在が漏れるため。
 */
export type TodoRepository = {
  readonly list: () => Promise<Todo[]>;
  readonly create: (title: string) => Promise<Todo>;
  readonly setDone: (id: TodoId, done: boolean) => Promise<Todo | undefined>;
  readonly remove: (id: TodoId) => Promise<boolean>;
};

export function todoRepository(env: Bindings, userId: string): TodoRepository {
  const table = ownedTodos(env, userId);

  return {
    list: async () => (await table.all()).map((row) => todoSchema.parse(row)),

    create: async (title) =>
      todoSchema.parse(
        await table.insert({
          id: crypto.randomUUID(),
          title,
          done: false,
          createdAt: new Date().toISOString(),
        }),
      ),

    setDone: async (id, done) => {
      const row = await table.update(id, { done });
      return row === undefined ? undefined : todoSchema.parse(row);
    },

    remove: async (id) => await table.remove(id),
  };
}
