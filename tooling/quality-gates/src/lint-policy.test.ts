import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { loadEffectiveOxlintConfig } from '../test/oxlint-config.ts';
import {
  ALLOWED_OFF_RULES,
  ALLOWED_OVERRIDE_OFF_RULES,
  LAYER_IMPORT_POLICY,
  LINT_CATEGORIES,
  LINT_IGNORE_PATTERNS,
  LINT_PLUGINS,
  REPOSITORY_WIDE_FILE_PATTERNS,
  REQUIRED_ERROR_RULES,
  WORKSPACE_IMPORT_DENY,
} from './lint-policy.ts';

const severityValueSchema = z.union([z.string(), z.tuple([z.string()]).rest(z.unknown())]);

// strict にしているのは、未知のトップレベルキーを黙って捨てないため。
// 非 strict だと `ignorePatterns` のような「適用範囲」を足しても
// パースの時点で消え、どのアサーションからも見えなくなる。
const oxlintrcSchema = z
  .object({
    $schema: z.string(),
    options: z
      .object({
        denyWarnings: z.boolean(),
        reportUnusedDisableDirectives: z.string(),
      })
      .strict(),
    plugins: z.array(z.string()),
    categories: z.record(z.string(), z.string()),
    rules: z.record(z.string(), severityValueSchema),
    overrides: z.array(
      z
        .object({
          files: z.array(z.string()),
          rules: z.record(z.string(), severityValueSchema).optional(),
        })
        .strict(),
    ),
    ignorePatterns: z.array(z.string()),
  })
  .strict();

type Oxlintrc = z.infer<typeof oxlintrcSchema>;

const ROOT_CONFIG = fileURLToPath(new URL('../../../.oxlintrc.json', import.meta.url));
const BASE_CONFIG = fileURLToPath(new URL('../oxlint-base.json', import.meta.url));

/**
 * `extends` を解決した実効設定を検証する（ADR 0010 の決定 6）。
 *
 * ルートの `.oxlintrc.json` は薄いラッパなので、ファイルをそのまま読むと
 * カテゴリもルールも「検査対象に無い」状態になり、改ざんを検出できなくなる。
 */
function loadOxlintrc(): Oxlintrc {
  return oxlintrcSchema.parse(loadEffectiveOxlintConfig(ROOT_CONFIG));
}

function severityOf(value: z.infer<typeof severityValueSchema>): string {
  return Array.isArray(value) ? value[0] : value;
}

/** ルール定義のうち `off` にしているルール名。 */
function offRulesOf(
  rules: Record<string, z.infer<typeof severityValueSchema>> | undefined,
): string[] {
  return Object.entries(rules ?? {})
    .filter(([, value]) => severityOf(value) === 'off')
    .map(([name]) => name);
}

/** ディレクトリ単位で黙らせてはいけないルールか。 */
function isDangerousToDisable(name: string): boolean {
  return name.startsWith('typescript/no-unsafe') || name === 'typescript/no-explicit-any';
}

const config = loadOxlintrc();

describe('実行オプションとルールの強度', () => {
  it('警告と不要な抑制コメントを失敗にする', () => {
    expect(config.options).toStrictEqual({
      denyWarnings: true,
      reportUnusedDisableDirectives: 'error',
    });
  });

  it('void による Promise の放置を許可しない', () => {
    expect(config.rules['typescript/no-floating-promises']).toStrictEqual([
      'error',
      { ignoreVoid: false },
    ]);
  });

  it('文字列・数値・nullable オブジェクトの条件を明示する', () => {
    expect(config.rules['typescript/strict-boolean-expressions']).toStrictEqual([
      'error',
      { allowString: false, allowNumber: false, allowNullableObject: false },
    ]);
  });

  it('引数のプロパティの変更も禁止する', () => {
    expect(config.rules['no-param-reassign']).toStrictEqual(['error', { props: true }]);
  });
});

/**
 * Lint 設定そのものの改ざんを検出する。
 *
 * しきい値の数値だけを見ていた時期は、カテゴリを off にする・重要ルールを off にする・
 * override でディレクトリ単位に黙らせる、といった「ゲートに詰まったときの最短の修復手段」を
 * 一切検出できなかった。設定の形ごと固定する。
 */
describe('カテゴリの severity', () => {
  it('宣言したポリシーと完全に一致する', () => {
    expect(config.categories).toStrictEqual({ ...LINT_CATEGORIES });
  });
});

describe('プラグイン', () => {
  it('必要なプラグインがすべて有効', () => {
    expect(config.plugins.toSorted()).toStrictEqual([...LINT_PLUGINS].toSorted());
  });
});

describe('rules の severity', () => {
  const errorRules = Object.entries(config.rules)
    .filter(([, value]) => severityOf(value) === 'error')
    .map(([name]) => name);
  const offRules = Object.entries(config.rules)
    .filter(([, value]) => severityOf(value) === 'off')
    .map(([name]) => name);

  it('error にしているルールがポリシーと完全に一致する', () => {
    expect(errorRules.toSorted()).toStrictEqual([...REQUIRED_ERROR_RULES].toSorted());
  });

  it('off にしているルールがポリシーと完全に一致する', () => {
    expect(offRules.toSorted()).toStrictEqual([...ALLOWED_OFF_RULES].toSorted());
  });

  it('warn は使わない（AI は warn を無視して進むため）', () => {
    const nonBinary = Object.entries(config.rules)
      .filter(([, value]) => !['error', 'off'].includes(severityOf(value)))
      .map(([name]) => name);
    expect(nonBinary).toStrictEqual([]);
  });
});

describe('overrides', () => {
  const disabled = new Set(config.overrides.flatMap((override) => offRulesOf(override.rules)));

  it('override で off にできるのは許可されたルールだけ', () => {
    const notAllowed = [...disabled].filter(
      (name) => !ALLOWED_OVERRIDE_OFF_RULES.some((allowed) => allowed === name),
    );
    expect(notAllowed).toStrictEqual([]);
  });

  it('override で off にできるルールに危険なものが含まれていない', () => {
    expect(ALLOWED_OVERRIDE_OFF_RULES.filter((name) => isDangerousToDisable(name))).toStrictEqual(
      [],
    );
  });
});

describe('適用範囲', () => {
  it('ignorePatterns がポリシーと完全に一致する', () => {
    // 除外先を固定しないと、新しいルールで大量にエラーが出たときに
    // `apps/web/src/**` を 1 行足すだけでエラーが消え、他のアサーションは全部緑で通る
    expect(config.ignorePatterns).toStrictEqual([...LINT_IGNORE_PATTERNS]);
  });

  it('ignorePatterns がソースディレクトリを覆っていない', () => {
    const coversSource = config.ignorePatterns.filter((pattern) =>
      /(?:^|\/)(?:apps|packages|tooling|scripts)(?:\/|$)/u.test(pattern),
    );
    expect(coversSource).toStrictEqual([]);
  });

  // ディレクトリ単位の例外という建前が成立しなくなるため、全体スコープでの
  // off は許可ルールであっても認めない
  const disabledEverywhere = config.overrides
    .filter((override) =>
      override.files.some((pattern) =>
        REPOSITORY_WIDE_FILE_PATTERNS.some((wide) => wide === pattern),
      ),
    )
    .flatMap((override) => offRulesOf(override.rules));

  it('リポジトリ全体を覆う override でルールを off にしていない', () => {
    expect(disabledEverywhere).toStrictEqual([]);
  });
});

/**
 * `no-restricted-imports` の値。severity と設定オブジェクトの形を厳密に見る。
 * 緩い形で受けると、`patterns` を空配列にした改ざんを検出できない。
 */
const restrictedImportsSchema = z.tuple([
  z.literal('error'),
  z
    .object({
      patterns: z
        .array(z.object({ group: z.array(z.string()), message: z.string() }).strict())
        .length(1),
    })
    .strict(),
]);

type LayerRule = { readonly files: readonly string[]; readonly allowed: readonly string[] };

/** `group` から allowlist（`!` 付き）を取り出す。ワークスペース名だけに正規化する。 */
function allowedWorkspaces(group: readonly string[]): string[] {
  return [
    ...new Set(
      group
        .filter((pattern) => pattern.startsWith('!'))
        .map((pattern) => pattern.slice(1).replace(/\/\*\*$/u, '')),
    ),
  ];
}

/** `.oxlintrc.json` の `no-restricted-imports` を、出現順のまま取り出す。 */
function declaredLayerRules(): LayerRule[] {
  return config.overrides
    .filter((override) => override.rules?.['no-restricted-imports'] !== undefined)
    .map((override) => {
      const [, options] = restrictedImportsSchema.parse(override.rules?.['no-restricted-imports']);
      const group = options.patterns[0]?.group ?? [];
      return { files: override.files, allowed: allowedWorkspaces(group) };
    });
}

/** 各層の `group` 先頭が持つ遮断パターン。重複を潰した形で比較する。 */
function declaredDenyHeads(): string[] {
  return [
    ...new Set(
      config.overrides
        .filter((override) => override.rules?.['no-restricted-imports'] !== undefined)
        .map((override) => {
          const [, options] = restrictedImportsSchema.parse(
            override.rules?.['no-restricted-imports'],
          );
          return (options.patterns[0]?.group ?? [])
            .slice(0, WORKSPACE_IMPORT_DENY.length)
            .join(',');
        }),
    ),
  ];
}

const declaredLayers = declaredLayerRules();
const denyHeads = declaredDenyHeads();
const dbReachableFiles = LAYER_IMPORT_POLICY.filter((rule) =>
  rule.allowed.some((workspace) => workspace === '@seri/db'),
).flatMap((rule) => rule.files);

describe('層の依存方向と認可スコープの境界', () => {
  it('対象ファイルと許可先が宣言したポリシーと完全に一致する（出現順を含む）', () => {
    // 出現順まで見るのは、oxlint の override が後勝ちだから。
    // `*-table.ts` の許可が `apps/api/src/**` の禁止より前に来ると db が全域で通る
    expect(declaredLayers).toStrictEqual(LAYER_IMPORT_POLICY);
  });

  it('どの層もワークスペース全体をサブパスごと遮断してから許可している', () => {
    // 先頭の遮断に `@seri/*/**` が無いと `@seri/db/schema` が素通りする（過去に実際に起きた）
    expect(denyHeads).toStrictEqual([WORKSPACE_IMPORT_DENY.join(',')]);
  });

  it('生の Drizzle テーブルに触れる範囲が広がっていない', () => {
    expect(dbReachableFiles).toStrictEqual([
      'apps/api/src/repositories/*-table.ts',
      'apps/api/src/lib/auth.ts',
    ]);
  });
});

/**
 * `extends` の意味論そのものを固定する（ADR 0010 の決定 6）。
 *
 * oxlint 1.79.0 で実測したところ、`ignorePatterns` だけは継承されない。
 * base 側に書いても効かないので、書いてあること自体が「除外できているつもり」の
 * 誤解になる。ここで書かせないことにして、適用範囲はルートに一本化する。
 */
describe('extends の適用範囲', () => {
  it('base 設定に ignorePatterns を置かない（継承されないので効かない）', () => {
    const base = loadEffectiveOxlintConfig(BASE_CONFIG);

    expect(base['ignorePatterns']).toStrictEqual([]);
  });

  it('ルートのラッパが実効設定にルール本体を持ち込んでいる', () => {
    // extends を外すと 0 件になる。ここが 0 なら ⑪ は何も見ていない
    expect(Object.keys(config.rules).length).toBeGreaterThan(REQUIRED_ERROR_RULES.length);
  });
});
