import type { TodoRow } from '@seri/db';
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
  /** `userId` は呼び出し側から渡せない。所有者を指定した挿入を型で禁じるため。 */
  readonly insert: (todo: Omit<TodoRow, 'userId'>) => Promise<TodoRow>;
  /** 更新できるのは `done` と `title` だけ。所有者と id が変わる更新を型で禁じる。 */
  readonly update: (
    id: string,
    values: Partial<Pick<TodoRow, 'done' | 'title'>>,
  ) => Promise<TodoRow | undefined>;
  readonly remove: (id: string) => Promise<boolean>;
};

export function ownedTodos(env: Bindings, userId: string): OwnedTodoTable {
  const db = createDb(env.DB);
  const mine = eq(todos.userId, userId);
  const own = (id: string) => and(mine, eq(todos.id, id));

  return {
    all: async () => await db.select().from(todos).where(mine).all(),

    // 挿入する行をこちらで組み立てて返す。`returning()` の結果を見て
    // 「0 行だったら」を分岐で書くと、実行され得ない枝がカバレッジに残る。
    insert: async (todo) => {
      const row = { ...todo, userId };
      await db.insert(todos).values(row).run();
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
