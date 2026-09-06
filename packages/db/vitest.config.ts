import { defineConfig } from 'vitest/config';

import { createVitestConfig } from '../../vitest.shared.ts';

// このパッケージは Drizzle のスキーマ宣言のみで振る舞いを持たない。
// 実際のクエリは apps/api の統合テスト（miniflare 上の実 D1）で検証するため、
// ここではカバレッジ計測の対象外にする。
export default defineConfig(
  createVitestConfig({
    exclude: ['src/**'],
    passWithNoTests: true,
  }),
);
