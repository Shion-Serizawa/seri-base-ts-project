import type { Todo, TodoId } from '@seri/contract';
import { todoSchema } from '@seri/contract';
import type { Database, NewTodoRow } from '@seri/db';
import { todos } from '@seri/db';
import { eq } from 'drizzle-orm';

export async function listTodos(db: Database): Promise<Todo[]> {
  const rows = await db.select().from(todos).all();
  return rows.map((row) => todoSchema.parse(row));
}

export async function insertTodo(db: Database, title: string): Promise<Todo> {
  const row: NewTodoRow = {
    id: crypto.randomUUID(),
    title,
    done: false,
    createdAt: new Date().toISOString(),
  };
  await db.insert(todos).values(row).run();
  return todoSchema.parse(row);
}

export async function setTodoDone(
  db: Database,
  id: TodoId,
  done: boolean,
): Promise<Todo | undefined> {
  const rows = await db.update(todos).set({ done }).where(eq(todos.id, id)).returning();
  const row = rows[0];
  return row === undefined ? undefined : todoSchema.parse(row);
}

export async function deleteTodo(db: Database, id: TodoId): Promise<boolean> {
  const rows = await db.delete(todos).where(eq(todos.id, id)).returning();
  return rows.length > 0;
}
