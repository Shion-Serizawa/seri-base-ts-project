/**
 * CORS で許可するオリジンを判定する。
 *
 * web と api は別 Worker（別オリジン）で動くため Cookie は cross-site 前提になる。
 * 受け取ったオリジンをそのまま反射しつつ `credentials: true` を許すと、
 * **任意のサイトからログイン済みユーザーの資格情報で API を叩ける**。
 * そのため許可リスト（バインディング `ALLOWED_ORIGINS`、カンマ区切り）で判定する。
 */
export function allowedOrigin(origin: string, allowedOrigins: string): string | null {
  const allowed = allowedOrigins
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return allowed.includes(origin) ? origin : null;
}
