import { implement } from '@orpc/server';
import { apiContract } from '@seri/contract';
import { createDb } from '@seri/db';
import { normalizeTitle } from '@seri/domain';

import type { Bindings } from '../env.ts';
import { createAuth } from '../lib/auth.ts';
import { deleteTodo, insertTodo, listTodos, setTodoDone } from '../repositories/todo-repository.ts';

type RequestContext = {
  readonly env: Bindings;
  /** セッション Cookie を読むために必要 */
  readonly headers: Headers;
};

const base = implement(apiContract).$context<RequestContext>();

/**
 * 認証ミドルウェア。ここを通った手続きだけが `userId` を受け取れる。
 *
 * `base` ではなく `os` を使って手続きを実装することで、
 * 「認証を通し忘れた手続き」は `context.userId` が型に無いためコンパイルできない。
 */
const os = base.use(async ({ context, next, errors }) => {
  const session = await createAuth(context.env).api.getSession({ headers: context.headers });
  if (session === null) {
    throw errors.UNAUTHORIZED();
  }
  return await next({ context: { userId: session.user.id } });
});

const list = os.todo.list.handler(async ({ context }) => {
  return await listTodos(createDb(context.env.DB), context.userId);
});

const create = os.todo.create.handler(async ({ input, context, errors }) => {
  const title = normalizeTitle(input.title);
  if (title.length === 0) {
    throw errors.BLANK_TITLE();
  }
  return await insertTodo(createDb(context.env.DB), context.userId, title);
});

const setDone = os.todo.setDone.handler(async ({ input, context, errors }) => {
  const updated = await setTodoDone(createDb(context.env.DB), context.userId, input.id, input.done);
  if (updated === undefined) {
    throw errors.NOT_FOUND();
  }
  return updated;
});

const remove = os.todo.remove.handler(async ({ input, context, errors }) => {
  const deleted = await deleteTodo(createDb(context.env.DB), context.userId, input.id);
  if (!deleted) {
    throw errors.NOT_FOUND();
  }
  return { id: input.id };
});

export const router = os.router({
  todo: { list, create, setDone, remove },
});
