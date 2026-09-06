import { join } from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

import { createCoverageOptions, TEST_INCLUDE } from '../../vitest.shared.ts';

// パスは cwd ではなくこのファイルの位置から解決する（knip 等が root から読むため）。
// node:url の URL 型は Workers ランタイム型と衝突するので使わず、
// import.meta.dirname を使う（型は test/import-meta.d.ts で宣言）。
const migrations = await readD1Migrations(
  join(import.meta.dirname, '../../packages/db/migrations'),
);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          BETTER_AUTH_SECRET: 'test-secret-value-for-integration-tests',
          BETTER_AUTH_URL: 'http://localhost:8787',
          ALLOWED_ORIGINS: 'http://localhost:5173',
        },
      },
    }),
  ],
  test: {
    include: [...TEST_INCLUDE],
    passWithNoTests: false,
    setupFiles: ['./test/apply-migrations.ts'],
    coverage: createCoverageOptions({
      provider: 'istanbul',
      exclude: ['src/worker.ts', 'src/env.ts', 'src/env-check.ts'],
    }),
  },
});
