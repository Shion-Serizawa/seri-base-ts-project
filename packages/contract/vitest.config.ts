import { createVitestConfig } from '@seri/vitest-config';
import { defineConfig, mergeConfig } from 'vitest/config';

// 型そのものが主要な成果物のパッケージなので、型テスト（*.test-d.ts）も走らせる。
export default mergeConfig(
  defineConfig(createVitestConfig()),
  defineConfig({
    test: {
      typecheck: {
        enabled: true,
        include: ['src/**/*.test-d.ts'],
        tsconfig: './tsconfig.json',
      },
    },
  }),
);
