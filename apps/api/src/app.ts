import { RPCHandler } from '@orpc/server/fetch';
import {
  API_BASE_PATH,
  AUTH_ROUTE,
  HEALTH_ROUTE,
  RPC_ENDPOINT,
  RPC_ROUTE,
} from '@seri/contract/endpoints';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppEnv } from './env.ts';
import { createAuth } from './lib/auth.ts';
import { allowedOrigin } from './lib/cors.ts';
import { router } from './rpc/router.ts';

/** oRPC の契約を実装したルータ。プレフィックス配下のリクエストを処理する。 */
const rpcHandler = new RPCHandler(router);

export const app = new Hono<AppEnv>()
  .basePath(API_BASE_PATH)
  // Cookie を伴う cross-origin リクエストを許すため、オリジンは許可リストで判定する。
  // 任意オリジンを反射しつつ credentials を許すと、任意のサイトから
  // ログイン済みユーザーの資格情報で API を叩けてしまう。
  .use(
    '*',
    cors({
      // Hono の cors は Context を型パラメータ無しで渡してくるため明示する
      origin: (origin: string, c: Context<AppEnv>) => allowedOrigin(origin, c.env.ALLOWED_ORIGINS),
      credentials: true,
    }),
  )
  .get(HEALTH_ROUTE, (c) => c.json({ status: 'ok' as const }))
  // better-auth のエンドポイント（sign-up / sign-in / session など）をまとめて委譲する
  .on(['GET', 'POST'], `${AUTH_ROUTE}/*`, async (c) => {
    return await createAuth(c.env).handler(c.req.raw);
  })
  // oRPC のエンドポイント。このプレフィックス配下は oRPC が全て処理する
  .all(`${RPC_ROUTE}/*`, async (c) => {
    const { matched, response } = await rpcHandler.handle(c.req.raw, {
      prefix: RPC_ENDPOINT,
      // headers は認証ミドルウェアがセッション Cookie を読むために必要
      context: { env: c.env, headers: c.req.raw.headers },
    });
    return matched ? response : c.json({ message: 'procedure not found' }, 404);
  });
