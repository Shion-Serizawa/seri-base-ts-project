import { implement } from '@orpc/server';
import { apiContract } from '@seri/contract';
import { createDb } from '@seri/db';
import { normalizeTitle } from '@seri/domain';

import type { Bindings } from '../env.ts';
import { deleteTodo, insertTodo, listTodos, setTodoDone } from '../repositories/todo-repository.ts';

const os = implement(apiContract).$context<{ readonly env: Bindings }>();

const list = os.todo.list.handler(async ({ context }) => {
  return await listTodos(createDb(context.env.DB));
});

const create = os.todo.create.handler(async ({ input, context, errors }) => {
  const title = normalizeTitle(input.title);
  if (title.length === 0) {
    throw errors.BLANK_TITLE();
  }
  return await insertTodo(createDb(context.env.DB), title);
});

const setDone = os.todo.setDone.handler(async ({ input, context, errors }) => {
  const updated = await setTodoDone(createDb(context.env.DB), input.id, input.done);
  if (updated === undefined) {
    throw errors.NOT_FOUND();
  }
  return updated;
});

const remove = os.todo.remove.handler(async ({ input, context, errors }) => {
  const deleted = await deleteTodo(createDb(context.env.DB), input.id);
  if (!deleted) {
    throw errors.NOT_FOUND();
  }
  return { id: input.id };
});

export const router = os.router({
  todo: { list, create, setDone, remove },
});
