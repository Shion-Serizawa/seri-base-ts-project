import type { AppType } from '@seri/api';
import { hc } from 'hono/client';

/**
 * Hono RPC クライアント。`AppType` は型としてのみ参照するため
 * バンドルに API 実装は含まれない（dependency-cruiser で実行時 import を禁止している）。
 */
export const api = hc<AppType>(import.meta.env.VITE_API_URL ?? '', {
  init: { credentials: 'include' },
});
