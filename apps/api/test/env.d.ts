import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare global {
  namespace Cloudflare {
    interface Env {
      /** vitest.config.ts が注入するテスト専用バインディング */
      readonly TEST_MIGRATIONS: D1Migration[];
    }
  }
}
