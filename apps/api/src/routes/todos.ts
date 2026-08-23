import { zValidator } from '@hono/zod-validator';
import { createTodoInputSchema, todoIdSchema, updateTodoInputSchema } from '@seri/contract';
import { createDb } from '@seri/db';
import { normalizeTitle } from '@seri/domain';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../env.ts';
import { deleteTodo, insertTodo, listTodos, setTodoDone } from '../repositories/todo-repository.ts';

const paramsSchema = z.object({ id: todoIdSchema });

export const todosRoute = new Hono<AppEnv>()
  .get('/', async (c) => {
    const todos = await listTodos(createDb(c.env.DB));
    return c.json(todos);
  })
  .post('/', zValidator('json', createTodoInputSchema), async (c) => {
    const title = normalizeTitle(c.req.valid('json').title);
    if (title.length === 0) {
      return c.json({ message: 'title must not be blank' }, 400);
    }
    const created = await insertTodo(createDb(c.env.DB), title);
    return c.json(created, 201);
  })
  .patch(
    '/:id',
    zValidator('param', paramsSchema),
    zValidator('json', updateTodoInputSchema),
    async (c) => {
      const updated = await setTodoDone(
        createDb(c.env.DB),
        c.req.valid('param').id,
        c.req.valid('json').done,
      );
      if (updated === undefined) {
        return c.json({ message: 'todo not found' }, 404);
      }
      return c.json(updated);
    },
  )
  .delete('/:id', zValidator('param', paramsSchema), async (c) => {
    const deleted = await deleteTodo(createDb(c.env.DB), c.req.valid('param').id);
    if (!deleted) {
      return c.json({ message: 'todo not found' }, 404);
    }
    return c.body(null, 204);
  });
