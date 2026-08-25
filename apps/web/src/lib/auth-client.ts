import { createAuthClient } from 'better-auth/react';

import { authUrl } from './api-origin.ts';

// 使うものだけを公開する（未使用 export は knip --production が検出する）
export const { useSession } = createAuthClient({
  baseURL: authUrl(),
});
