import { createVitestConfig } from '@seri/vitest-config';
import { defineConfig } from 'vitest/config';

/**
 * ルートワークスペース（`scripts/**`）のテスト設定。
 *
 * 適応度関数の実装自体を検証する。ここのバグは「ゲートが常に緑になる」形で現れ、
 * 型検査でも他のテストでも捕まらない。
 *
 * カバレッジから外しているのは、`process.exit` を呼ぶだけの実行入口
 * （引数と終了コードの結線しか持たない数行）。判定ロジックは全て別モジュールにある。
 */
export default defineConfig(
  createVitestConfig({
    include: ['scripts/**/*.test.ts'],
    coverageInclude: ['scripts/**/*.ts'],
    exclude: [
      'scripts/fitness/run.ts',
      'scripts/fitness/supply-chain.ts',
      'scripts/git/check-commit-message.ts',
      'scripts/mutation/run-changed.ts',
      'scripts/openapi/write-spec.ts',
      // テスト専用のフィクスチャヘルパ
      'scripts/test/**',
    ],
  }),
);
