import { defineConfig } from 'vitest/config';

import { QUALITY_GATES } from './src/index.ts';

// このパッケージは他のツーリング設定の土台なので、@seri/vitest-config には依存しない
// （循環参照になる）。しきい値は自身の QUALITY_GATES から直接読む。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: QUALITY_GATES.coverage,
    },
  },
});
