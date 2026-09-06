import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Comparison } from '../lib/compare.ts';
import { differences } from '../lib/compare.ts';
import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import type { JsonObject, OxlintOverride } from '../lib/oxlint-config.ts';
import {
  isRecord,
  loadEffectiveOxlintConfig,
  overridesOf,
  stringsAt,
} from '../lib/oxlint-config.ts';
import type { CheckResult } from '../lib/report.ts';
import { DB_REACHABLE_FILES, LAYER_IMPORT_POLICY, WORKSPACE_IMPORT_DENY } from './layer-policy.ts';

const ROOT_CONFIG = '.oxlintrc.json';
const RULE = 'no-restricted-imports';

type LayerRule = { readonly files: readonly string[]; readonly allowed: readonly string[] };

/**
 * `no-restricted-imports` の値から `group` を取り出す。形が崩れていれば `undefined`。
 *
 * 緩い形で受けると、`patterns` を空配列にした改ざんや、余計なキーを足して
 * 意味を変える改ざんを検出できない。severity・キーの数まで見る。
 */
function soleOptions(value: unknown): JsonObject | undefined {
  if (!Array.isArray(value) || value.length !== 2 || value[0] !== 'error') {
    return undefined;
  }
  const options: unknown = value[1];
  return isRecord(options) && Object.keys(options).length === 1 ? options : undefined;
}

function solePattern(options: JsonObject): JsonObject | undefined {
  const patterns: unknown = options['patterns'];
  if (!Array.isArray(patterns) || patterns.length !== 1) {
    return undefined;
  }
  const first: unknown = patterns[0];
  const wellFormed =
    isRecord(first) && Object.keys(first).length === 2 && typeof first['message'] === 'string';
  return wellFormed && isRecord(first) ? first : undefined;
}

function groupOf(value: unknown): string[] | undefined {
  const options = soleOptions(value);
  if (options === undefined) {
    return undefined;
  }
  const pattern = solePattern(options);
  if (pattern === undefined) {
    return undefined;
  }
  const group = stringsAt(pattern, 'group');
  return group.length > 0 ? group : undefined;
}

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

function layerOverrides(config: JsonObject): OxlintOverride[] {
  return overridesOf(config).filter((override) => override.rules[RULE] !== undefined);
}

/** 宣言されている層規則を、出現順のまま取り出す。形が崩れた項目は `allowed` を `null` にする。 */
function declaredLayers(
  overrides: readonly OxlintOverride[],
): (LayerRule | { files: readonly string[]; allowed: null })[] {
  return overrides.map((override) => {
    const group = groupOf(override.rules[RULE]);
    return group === undefined
      ? { files: override.files, allowed: null }
      : { files: override.files, allowed: allowedWorkspaces(group) };
  });
}

/** 各層の `group` 先頭が持つ遮断パターン。重複を潰した形で比較する。 */
function denyHeads(overrides: readonly OxlintOverride[]): string[] {
  return [
    ...new Set(
      overrides.map((override) =>
        (groupOf(override.rules[RULE]) ?? []).slice(0, WORKSPACE_IMPORT_DENY.length).join(','),
      ),
    ),
  ];
}

function comparisons(config: JsonObject): Comparison[] {
  const overrides = layerOverrides(config);
  const dbReachable = declaredLayers(overrides)
    .filter((rule) => rule.allowed?.some((workspace) => workspace === '@seri/db') === true)
    .flatMap((rule) => rule.files);

  return [
    {
      // 出現順まで見るのは、oxlint の override が後勝ちだから。
      // `*-table.ts` の許可が `apps/api/src/**` の禁止より前に来ると db が全域で通る
      label: '層の対象ファイルと許可先（出現順を含む）',
      actual: declaredLayers(overrides),
      expected: LAYER_IMPORT_POLICY,
    },
    {
      // 先頭の遮断に `@seri/*/**` が無いと `@seri/db/schema` が素通りする（過去に実際に起きた）
      label: 'ワークスペース全体の遮断パターン',
      actual: denyHeads(overrides),
      expected: [WORKSPACE_IMPORT_DENY.join(',')],
    },
    {
      label: '生の Drizzle テーブルに触れる範囲',
      actual: dbReachable,
      expected: DB_REACHABLE_FILES,
    },
  ];
}

/**
 * 層の依存方向（⑦）と認可スコープの境界（⑭）が、宣言したポリシーどおりに
 * `.oxlintrc.json` に書かれていることを検証する。
 *
 * lint 自体は境界を守らせるが、「境界の定義そのものを書き換える」ことは lint では
 * 止められない。定義をコードに持ち、設定との一致を見る。
 */
export function checkLayerBoundary(context: FitnessContext = defaultContext()): CheckResult[] {
  const rootConfigPath = join(context.root, ROOT_CONFIG);
  const name = 'layer boundary';
  const expected = '宣言した層のポリシーと完全に一致';

  if (!existsSync(rootConfigPath)) {
    // 設定が無いことを PASS にすると、消した瞬間に境界の検査が常に緑になる
    return [
      {
        name,
        ok: false,
        actual: '設定なし（計測不能）',
        expected,
        details: [`${ROOT_CONFIG} が存在しない`],
      },
    ];
  }

  const details = differences(comparisons(loadEffectiveOxlintConfig(rootConfigPath)));
  return [
    {
      name,
      ok: details.length === 0,
      actual: details.length === 0 ? '一致' : `${details.length} 件の不一致`,
      expected,
      ...(details.length > 0 ? { details } : {}),
    },
  ];
}
