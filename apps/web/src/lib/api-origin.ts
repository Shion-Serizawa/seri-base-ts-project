/**
 * API のオリジン。`VITE_API_URL` が未設定なら同一オリジンを使う。
 *
 * oRPC クライアントと better-auth クライアントの両方が必要とするため、
 * ここに 1 箇所だけ置く（重複させると分岐のテストも二重になる）。
 */
export function apiOrigin(): string {
  return import.meta.env.VITE_API_URL ?? globalThis.location.origin;
}

/** oRPC のエンドポイント URL。 */
export function rpcUrl(): string {
  return `${apiOrigin()}/api/rpc`;
}

/** better-auth のエンドポイント URL。 */
export function authUrl(): string {
  return `${apiOrigin()}/api/auth`;
}
