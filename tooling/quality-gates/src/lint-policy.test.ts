import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ALLOWED_OFF_RULES,
  ALLOWED_OVERRIDE_OFF_RULES,
  LINT_CATEGORIES,
  LINT_PLUGINS,
  REQUIRED_ERROR_RULES,
} from './lint-policy.ts';

const severityValueSchema = z.union([z.string(), z.tuple([z.string()]).rest(z.unknown())]);

const oxlintrcSchema = z.object({
  plugins: z.array(z.string()),
  categories: z.record(z.string(), z.string()),
  rules: z.record(z.string(), severityValueSchema),
  overrides: z.array(
    z.object({
      files: z.array(z.string()),
      rules: z.record(z.string(), severityValueSchema).optional(),
    }),
  ),
});

type Oxlintrc = z.infer<typeof oxlintrcSchema>;

function loadOxlintrc(): Oxlintrc {
  const raw = readFileSync(new URL('../../../.oxlintrc.json', import.meta.url), 'utf8');
  // .oxlintrc.json は JSONC（行コメント可）
  return oxlintrcSchema.parse(JSON.parse(raw.replaceAll(/^\s*\/\/.*$/gmu, '')));
}

function severityOf(value: z.infer<typeof severityValueSchema>): string {
  return Array.isArray(value) ? value[0] : value;
}

/** ディレクトリ単位で黙らせてはいけないルールか。 */
function isDangerousToDisable(name: string): boolean {
  return name.startsWith('typescript/no-unsafe') || name === 'typescript/no-explicit-any';
}

const config = loadOxlintrc();

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
  const disabled = new Set(
    config.overrides.flatMap((override) =>
      Object.entries(override.rules ?? {})
        .filter(([, value]) => severityOf(value) === 'off')
        .map(([name]) => name),
    ),
  );

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
