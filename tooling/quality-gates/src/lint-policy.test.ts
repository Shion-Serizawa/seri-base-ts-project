import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ALLOWED_OFF_RULES,
  ALLOWED_OVERRIDE_OFF_RULES,
  LINT_CATEGORIES,
  LINT_IGNORE_PATTERNS,
  LINT_PLUGINS,
  REPOSITORY_WIDE_FILE_PATTERNS,
  REQUIRED_ERROR_RULES,
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

function loadOxlintrc(): Oxlintrc {
  const raw = readFileSync(new URL('../../../.oxlintrc.json', import.meta.url), 'utf8');
  // .oxlintrc.json は JSONC（行コメント可）
  return oxlintrcSchema.parse(JSON.parse(raw.replaceAll(/^\s*\/\/.*$/gmu, '')));
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
