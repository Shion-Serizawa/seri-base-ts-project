import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { apiContract } from '@seri/contract';

import { rpcUrl } from './api-origin.ts';

const link = new RPCLink({
  url: rpcUrl(),
  // 認証 Cookie を送るために必要
  fetch: async (request, init) => await fetch(request, { ...init, credentials: 'include' }),
});

/**
 * oRPC クライアント。型は `@seri/contract` の契約からのみ得ており、
 * `apps/api` の実装には依存しない（oxlint が import を禁止している）。
 */
export const apiClient: ContractRouterClient<typeof apiContract> = createORPCClient(link);
