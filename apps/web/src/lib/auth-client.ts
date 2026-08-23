import { createAuthClient } from 'better-auth/react';

import { authUrl } from './api-origin.ts';

export const authClient = createAuthClient({
  baseURL: authUrl(),
});

// 使うものだけを再エクスポートする（未使用 export は knip が検出する）
export const { useSession } = authClient;
