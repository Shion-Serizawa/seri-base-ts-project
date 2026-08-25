import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { user } from './auth-schema.ts';

/**
 * Todo はユーザーに属する。
 *
 * `userId` を必須にしているのは、リポジトリ層のクエリでスコープを付け忘れると
 * 他人のデータが見えてしまうため。列が無いと「付け忘れ」が型でもテストでも現れない。
 */
export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export type TodoRow = typeof todos.$inferSelect;
export type NewTodoRow = typeof todos.$inferInsert;

export { account, session, user, verification } from './auth-schema.ts';
