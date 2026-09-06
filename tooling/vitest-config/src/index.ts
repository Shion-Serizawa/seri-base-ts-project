import gates from '@seri/base-tooling/quality-gates.json' with { type: 'json' };
/**
 * 共通 Vitest 設定。
 *
 * **A 層（`@seri/base-tooling`）にあるものを、ここにだけローカルで持っている。**
 * `vitest.config.ts` は Vite の設定ローダー（Node）が直接実行するため、
 * `node_modules` 配下の TypeScript を import できない
 * （`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）。パッケージから引けるのは JSON だけ。
 *
 * 乖離させてはいけないのは**しきい値**の方なので、数値は
 * `@seri/base-tooling/quality-gates.json` を単一情報源として引いている。
 * 組み立てる関数の側は除外パスなどがプロジェクトごとに違うため、ここで持って構わない。
 * 経緯は docs/adr/0010-base-repo-derivation-and-propagation.md を参照。
 */
import type { ViteUserConfig } from 'vitest/config';

type Environment = 'node' | 'happy-dom';

type CoverageOptions = {
  /** カバレッジ計測から外すパス。再エクスポートのみのバレルファイル等 */
  readonly exclude?: readonly string[];
  /**
   * 計測対象。既定は `src/**`。
   * ルートワークスペース（`scripts/**`）のように src レイアウトでない場合に指定する。
   */
  readonly coverageInclude?: readonly string[];
  /**
   * 計測方式。既定は v8（高速）。
   * Cloudflare Workers プール（workerd）は v8 の Profiler セッションを実装していないため
   * `istanbul`（コード計装方式）を指定する必要がある。
   */
  readonly provider?: 'v8' | 'istanbul';
};

type Options = CoverageOptions & {
  readonly environment?: Environment;
  readonly setupFiles?: readonly string[];
  /** テストファイルの探索パターン。既定は `src/**` */
  readonly include?: readonly string[];
  /** 振る舞いを持たない宣言だけのパッケージ向け */
  readonly passWithNoTests?: boolean;
};

/**
 * カバレッジ設定。しきい値は QUALITY_GATES を単一情報源とする。
 * Cloudflare Workers プール（defineWorkersConfig）からも再利用できるよう切り出している。
 */
export function createCoverageOptions(
  options: CoverageOptions = {},
): NonNullable<NonNullable<ViteUserConfig['test']>['coverage']> {
  return {
    provider: options.provider ?? 'v8',
    reporter: ['text-summary', 'json-summary', 'lcov'],
    reportsDirectory: './coverage',
    include: [...(options.coverageInclude ?? ['src/**/*.ts', 'src/**/*.tsx'])],
    exclude: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      // 型テストは実行されないので行カバレッジの対象にしない（型検査で担保される）
      'src/**/*.test-d.ts',
      'src/**/index.ts',
      'src/**/*.gen.ts',
      ...(options.exclude ?? []),
    ],
    thresholds: {
      lines: gates.coverage.lines,
      functions: gates.coverage.functions,
      branches: gates.coverage.branches,
      statements: gates.coverage.statements,
      // ファイル単位で要求する（集計だと未テストのファイルが他のコードに隠れる）
      perFile: gates.coverage.perFile,
    },
  };
}

export const TEST_INCLUDE = ['src/**/*.test.ts', 'src/**/*.test.tsx'] as const;

/** Node / DOM 環境のパッケージ向け共通 Vitest 設定。 */
export function createVitestConfig(options: Options = {}): ViteUserConfig {
  const {
    environment = 'node',
    setupFiles = [],
    exclude = [],
    include = TEST_INCLUDE,
    passWithNoTests = false,
  } = options;

  return {
    test: {
      environment,
      setupFiles: [...setupFiles],
      include: [...include],
      passWithNoTests,
      clearMocks: true,
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      coverage: createCoverageOptions({
        exclude,
        ...(options.coverageInclude === undefined
          ? {}
          : { coverageInclude: options.coverageInclude }),
        // 転送しないと `provider: 'istanbul'` が型エラーも警告も無く握り潰され、
        // workerd で「カバレッジが 0」という分かりにくい形で現れる
        ...(options.provider === undefined ? {} : { provider: options.provider }),
      }),
    },
  };
}
