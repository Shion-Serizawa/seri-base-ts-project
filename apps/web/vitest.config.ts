import { createVitestConfig } from '@seri/vitest-config';
import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  defineConfig({ plugins: [react()] }),
  defineConfig(
    createVitestConfig({
      environment: 'happy-dom',
      setupFiles: ['./test/setup.ts'],
      exclude: ['src/main.tsx', 'src/routeTree.gen.ts', 'src/routes/**'],
    }),
  ),
);
