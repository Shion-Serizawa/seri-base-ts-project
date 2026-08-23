import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppEnv } from './env.ts';
import { createAuth } from './lib/auth.ts';
import { todosRoute } from './routes/todos.ts';

export const app = new Hono<AppEnv>()
  .basePath('/api')
  .use('*', cors({ origin: (origin) => origin, credentials: true }))
  .get('/health', (c) => c.json({ status: 'ok' as const }))
  // better-auth のエンドポイント（sign-up / sign-in / session など）をまとめて委譲する
  .on(['GET', 'POST'], '/auth/*', async (c) => {
    return await createAuth(c.env).handler(c.req.raw);
  })
  .route('/todos', todosRoute);

/** Hono RPC クライアント（apps/web）がこの型を参照する。 */
export type AppType = typeof app;
