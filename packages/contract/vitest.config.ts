import { defineConfig, mergeConfig } from 'vitest/config';

import { createVitestConfig } from '../../vitest.shared.ts';

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
