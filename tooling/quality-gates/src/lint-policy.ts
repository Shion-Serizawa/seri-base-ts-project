/**
 * Lint 設定のポリシー。`.oxlintrc.json` がこの通りになっていることを
 * `lint-policy.test.ts` が検証する。
 *
 * なぜこれが必要か:
 * しきい値（複雑度の 7 つの数値）だけを検証していた時期は、
 * `"correctness": "off"` や `"vitest/expect-expect": "off"` のような
 * **カテゴリ・severity の改ざんを一切検出できなかった**。
 * ゲートに詰まったときの最短の修復手段がそのまま通ってしまうため、
 * 設定の「形」ごと固定する。
 *
 * 変更するときは、この配列とテストを一緒に直すことになる。
 * つまり「設定ファイルをこっそり緩める」ができず、
 * ポリシーの変更として明示的に現れる。
 */

/** カテゴリの severity。完全一致で検証する。 */
export const LINT_CATEGORIES = {
  correctness: 'error',
  suspicious: 'error',
  perf: 'error',
  pedantic: 'error',
  style: 'off',
  restriction: 'off',
  nursery: 'off',
} as const;

/** 有効化していなければならないプラグイン。 */
export const LINT_PLUGINS = [
  'typescript',
  'unicorn',
  'oxc',
  'import',
  'promise',
  'node',
  'react',
  'react-perf',
  'jsx-a11y',
  'vitest',
] as const;

/**
 * `rules` で必ず `error` になっていなければならないルール。
 * 消しても off にしてもテストが落ちる。
 */
export const REQUIRED_ERROR_RULES = [
  // 複雑度（数値は QUALITY_GATES.complexity と一致していることを別テストで検証）
  'complexity',
  'max-depth',
  'max-lines',
  'max-lines-per-function',
  'max-nested-callbacks',
  'max-params',
  'max-statements',
  'max-classes-per-file',

  // style から個別採用しているもの
  'eqeqeq',
  'prefer-const',
  'no-else-return',
  'func-style',
  'no-console',
  'node/no-process-env',
  'no-warning-comments',
  'unicorn/filename-case',
  'import/no-default-export',
  'import/no-cycle',
  'import/no-duplicates',
  'import/no-self-import',

  // any の混入と暗黙の緩さの禁止
  'typescript/no-explicit-any',
  'typescript/ban-ts-comment',
  'typescript/consistent-type-imports',
  'typescript/explicit-module-boundary-types',
  'typescript/no-non-null-assertion',

  // 型情報が必要なルール
  'typescript/await-thenable',
  'typescript/no-base-to-string',
  'typescript/no-confusing-void-expression',
  'typescript/no-deprecated',
  'typescript/no-floating-promises',
  'typescript/no-misused-promises',
  'typescript/no-misused-spread',
  'typescript/no-unnecessary-condition',
  'typescript/no-unnecessary-template-expression',
  'typescript/no-unsafe-argument',
  'typescript/no-unsafe-assignment',
  'typescript/no-unsafe-call',
  'typescript/no-unsafe-enum-comparison',
  'typescript/no-unsafe-member-access',
  'typescript/no-unsafe-return',
  'typescript/no-unsafe-type-assertion',
  'typescript/only-throw-error',
  'typescript/prefer-nullish-coalescing',
  'typescript/require-await',
  'typescript/restrict-template-expressions',
  'typescript/return-await',
  'typescript/strict-boolean-expressions',
  'typescript/switch-exhaustiveness-check',

  // テストの質（カバレッジ水増しの門番）
  'vitest/expect-expect',
  'vitest/no-conditional-expect',
  'vitest/no-disabled-tests',
  'vitest/no-focused-tests',
  'vitest/no-standalone-expect',
  'vitest/valid-expect',
] as const;

/**
 * `rules` で `off` にしてよいルール。理由は `.oxlintrc.json` のコメントに書いてある。
 * ここに無いルールを off にするとテストが落ちる。
 */
export const ALLOWED_OFF_RULES = [
  'react/react-in-jsx-scope',
  'typescript/prefer-readonly-parameter-types',
  'typescript/strict-void-return',
  'react-perf/jsx-no-new-function-as-prop',
  'vitest/no-importing-vitest-globals',
  'vitest/prefer-expect-assertions',
  'import/no-nodejs-modules',
] as const;

/**
 * `overrides` で off にしてよいルール。
 *
 * ここに correctness 系や `typescript/no-unsafe-*` を入れないことが重要。
 * ディレクトリ単位で危険なルールを黙らせる、という抜け道を塞ぐ。
 */
export const ALLOWED_OVERRIDE_OFF_RULES = [
  'import/no-default-export',
  'import/no-unassigned-import',
  'max-lines',
  'max-lines-per-function',
  'max-nested-callbacks',
  'max-statements',
  'no-console',
  'node/no-process-env',
  'node/no-sync',
  'react-perf/jsx-no-new-array-as-prop',
  'react-perf/jsx-no-new-object-as-prop',
  'typescript/explicit-module-boundary-types',
  'typescript/no-non-null-assertion',
  'unicorn/filename-case',
] as const;
