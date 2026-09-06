import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';

import { createVitestConfig, TEST_INCLUDE } from '../../vitest.shared.ts';

export default mergeConfig(
  defineConfig({ plugins: [react()] }),
  defineConfig(
    createVitestConfig({
      environment: 'happy-dom',
      setupFiles: ['./test/setup.ts'],
      // test/ 配下のテストヘルパ自身のテストも走らせる。
      // a11y ヘルパが「違反を検出できること」を検証しないと、
      // ルールを絞りすぎて常に空配列を返す状態に気づけない（false green）
      include: [...TEST_INCLUDE, 'test/**/*.test.ts'],
      exclude: ['src/main.tsx', 'src/routeTree.gen.ts', 'src/routes/**'],
    }),
  ),
);
