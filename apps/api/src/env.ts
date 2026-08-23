import type { AnyD1Database } from 'drizzle-orm/d1';

/**
 * Worker のバインディング型。
 *
 * apps/web が `AppType` を型として参照する際にこのファイルも型解決されるため、
 * Workers のグローバル型（`Cloudflare.Env` / `D1Database`）に依存させない。
 * wrangler.jsonc との整合は env-check.ts が型レベルで検証する。
 */
export type Bindings = {
  readonly DB: AnyD1Database;
  /** 署名鍵。.dev.vars（ローカル）と `wrangler secret put`（本番）で与える */
  readonly BETTER_AUTH_SECRET: string;
  /** 認証エンドポイントの絶対 URL */
  readonly BETTER_AUTH_URL: string;
};

export type AppEnv = {
  readonly Bindings: Bindings;
};
