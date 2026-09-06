import type { NewTodoRow, TodoRow } from '@seri/db';
import { createDb, todos } from '@seri/db';
import { and, eq } from 'drizzle-orm';

import type { Bindings } from '../env.ts';

/**
 * `todos` テーブルへのアクセスを「セッションのユーザーで絞ったもの」だけに限定する。
 *
 * 生の `todos` を import してよいのは `*-table.ts` だけで、oxlint の
 * `no-restricted-imports` が他のファイルからの `@seri/db` を遮断する（適応度関数 ⑭）。
 * 呼び出し側は `userId` を受け取らないため、**where 句にスコープを付け忘れる書き方が
 * そもそも書けない**。型でも lint でも落ちない唯一の認可漏れの経路を塞ぐのが目的。
 *
 * 新しいリソースを足すときは、このファイルを写して `<resource>-table.ts` を作る。
 */
export type OwnedTodoTable = {
  readonly all: () => Promise<TodoRow[]>;
  readonly insert: (todo: Omit<NewTodoRow, 'userId'>) => Promise<TodoRow>;
  readonly update: (id: string, values: OwnedTodoUpdate) => Promise<TodoRow | undefined>;
  readonly remove: (id: string) => Promise<boolean>;
};

/** 所有者が変わる更新を型で禁じるため、`userId` と `id` を含めない。 */
export type OwnedTodoUpdate = Partial<Pick<TodoRow, 'done' | 'title'>>;

export function ownedTodos(env: Bindings, userId: string): OwnedTodoTable {
  const db = createDb(env.DB);
  const mine = eq(todos.userId, userId);
  const own = (id: string) => and(mine, eq(todos.id, id));

  return {
    all: async () => await db.select().from(todos).where(mine).all(),

    insert: async (todo) => {
      const rows = await db
        .insert(todos)
        .values({ ...todo, userId })
        .returning();
      const row = rows[0];
      if (row === undefined) {
        throw new Error('Todo を作成できませんでした');
      }
      return row;
    },

    update: async (id, values) => {
      const rows = await db.update(todos).set(values).where(own(id)).returning();
      return rows[0];
    },

    remove: async (id) => {
      const rows = await db.delete(todos).where(own(id)).returning();
      return rows.length > 0;
    },
  };
}
