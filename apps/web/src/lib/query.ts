import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { QueryClient } from '@tanstack/react-query';

import { apiClient } from './api-client.ts';

/** TanStack Query 用のユーティリティ。`orpc.todo.list.queryOptions()` のように使う。 */
export const orpc = createTanstackQueryUtils(apiClient);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
    },
  });
}
