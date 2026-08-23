import { createAuthClient } from 'better-auth/react';

// better-auth は絶対 URL を要求するため、VITE_API_URL が未設定なら同一オリジンを使う。
const apiOrigin = import.meta.env.VITE_API_URL ?? globalThis.location.origin;

export const authClient = createAuthClient({
  baseURL: `${apiOrigin}/api/auth`,
});

// 使うものだけを再エクスポートする（未使用 export は knip が検出する）
export const { useSession } = authClient;
