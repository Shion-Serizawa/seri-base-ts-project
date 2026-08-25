import { AUTH_ENDPOINT, RPC_ENDPOINT } from '@seri/contract/endpoints';

/**
 * API のオリジン。`VITE_API_URL` が未設定なら同一オリジンを使う。
 *
 * パスは `@seri/contract` の定数を使う（サーバのマウント先と同じ情報源）。
 */
function apiOrigin(): string {
  return import.meta.env.VITE_API_URL ?? globalThis.location.origin;
}

/** oRPC のエンドポイント URL。 */
export function rpcUrl(): string {
  return `${apiOrigin()}${RPC_ENDPOINT}`;
}

/** better-auth のエンドポイント URL。 */
export function authUrl(): string {
  return `${apiOrigin()}${AUTH_ENDPOINT}`;
}
