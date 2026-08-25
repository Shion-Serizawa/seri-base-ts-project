import type { AnyD1Database } from 'drizzle-orm/d1';

/**
 * Worker のバインディング型。
 *
 * apps/web はこのファイルを参照しない（型は @seri/contract の契約から得る）が、
 * Workers のグローバル型に依存しない形は維持しておく。
 * wrangler.jsonc との整合は env-check.ts が型レベルで検証する。
 */
export type Bindings = {
  readonly DB: AnyD1Database;
  /** 署名鍵。.dev.vars（ローカル）と `wrangler secret put`（本番）で与える */
  readonly BETTER_AUTH_SECRET: string;
  /** 認証エンドポイントの絶対 URL */
  readonly BETTER_AUTH_URL: string;
  /** CORS で許可するオリジン（カンマ区切り）。Cookie を伴うため反射は禁止 */
  readonly ALLOWED_ORIGINS: string;
};

export type AppEnv = {
  readonly Bindings: Bindings;
};
