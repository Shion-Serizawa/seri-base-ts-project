import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { createCoverageOptions, TEST_INCLUDE } from '@seri/vitest-config';
import { defineConfig } from 'vitest/config';

const MIGRATIONS = join('packages', 'db', 'migrations');

/**
 * マイグレーションの置き場所を、このファイルの位置から**上に辿って**探す。
 *
 * パスは cwd ではなくファイルの位置から解決する（knip 等が root から読むため）。
 * 固定の `../../` にしていた時期は、ミューテーションテスト（④）で壊れていた。
 * Stryker はワークスペースを `.stryker-tmp/sandbox-*` に複製してその中で vitest を
 * 走らせるので、`../../` がリポジトリのルートに届かず `ENOENT` で即死し、
 * **apps/api のミューテーションが一度も実行されていなかった**。
 *
 * node:url の URL 型は Workers ランタイム型と衝突するので使わず、
 * import.meta.dirname を使う（型は test/import-meta.d.ts で宣言）。
 */
function findMigrations(from: string): string {
  let current = from;
  for (;;) {
    const candidate = join(current, MIGRATIONS);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`${MIGRATIONS} が見つからない（${from} から上に辿った）`);
    }
    current = parent;
  }
}

const migrations = await readD1Migrations(findMigrations(import.meta.dirname));

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
