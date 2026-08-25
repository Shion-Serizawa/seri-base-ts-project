import type { Todo, TodoId } from '@seri/contract';
import { todoSchema } from '@seri/contract';
import type { Database, NewTodoRow } from '@seri/db';
import { todos } from '@seri/db';
import { and, eq } from 'drizzle-orm';

/**
 * すべてのクエリを `userId` でスコープする。
 *
 * 他人の Todo に対する更新・削除は「見つからない」として扱う。
 * 403 を返すと id の存在が漏れるため。
 */
function ownedBy(userId: string, id: TodoId) {
  return and(eq(todos.userId, userId), eq(todos.id, id));
}

export async function listTodos(db: Database, userId: string): Promise<Todo[]> {
  const rows = await db.select().from(todos).where(eq(todos.userId, userId)).all();
  return rows.map((row) => todoSchema.parse(row));
}

export async function insertTodo(db: Database, userId: string, title: string): Promise<Todo> {
  const row: NewTodoRow = {
    id: crypto.randomUUID(),
    userId,
    title,
    done: false,
    createdAt: new Date().toISOString(),
  };
  await db.insert(todos).values(row).run();
  return todoSchema.parse(row);
}

export async function setTodoDone(
  db: Database,
  userId: string,
  id: TodoId,
  done: boolean,
): Promise<Todo | undefined> {
  const rows = await db.update(todos).set({ done }).where(ownedBy(userId, id)).returning();
  const row = rows[0];
  return row === undefined ? undefined : todoSchema.parse(row);
}

export async function deleteTodo(db: Database, userId: string, id: TodoId): Promise<boolean> {
  const rows = await db.delete(todos).where(ownedBy(userId, id)).returning();
  return rows.length > 0;
}
