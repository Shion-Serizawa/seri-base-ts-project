import { RPCHandler } from '@orpc/server/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppEnv } from './env.ts';
import { createAuth } from './lib/auth.ts';
import { router } from './rpc/router.ts';

/** oRPC の契約を実装したルータ。プレフィックス配下のリクエストを処理する。 */
const rpcHandler = new RPCHandler(router);

export const RPC_PREFIX = '/api/rpc';

export const app = new Hono<AppEnv>()
  .basePath('/api')
  .use('*', cors({ origin: (origin) => origin, credentials: true }))
  .get('/health', (c) => c.json({ status: 'ok' as const }))
  // better-auth のエンドポイント（sign-up / sign-in / session など）をまとめて委譲する
  .on(['GET', 'POST'], '/auth/*', async (c) => {
    return await createAuth(c.env).handler(c.req.raw);
  })
  // oRPC のエンドポイント。このプレフィックス配下は oRPC が全て処理する
  .all('/rpc/*', async (c) => {
    const { matched, response } = await rpcHandler.handle(c.req.raw, {
      prefix: RPC_PREFIX,
      context: { env: c.env },
    });
    return matched ? response : c.json({ message: 'procedure not found' }, 404);
  });
