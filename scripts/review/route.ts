import type { Dimension, DimensionKey } from './dimensions.ts';
import { DIMENSIONS } from './dimensions.ts';

/**
 * 変更されたパスから、起動すべきレビュー観点を決める。
 *
 * **ここを LLM にやらせない。** 分類器が観点を 1 つ黙って落としたとき、レビューは
 * 「実施済み・指摘なし」を返す。これは ADR 0002 / 0005 が記録している
 * 「ゲートが黙って緑だった」と同じ壊れ方で、しかも検出手段が無い。
 * 純関数にして、誤検出と検出漏れの両方をテストで固定する。
 */

/**
 * 常設の 2 観点に加えて同時に起動する条件付き観点の上限。
 *
 * export しないのは、テストのためだけの export を ⑥′（`knip --production`）が
 * 落とすため。テストは `routeReview` の既定値と第 2 引数を通して検証する。
 */
const MAX_CONDITIONAL = 3;

type Rule = {
  readonly key: DimensionKey;
  readonly reason: string;
  readonly pattern: RegExp;
};

/**
 * 発火条件。「理論上関係する」ではなく「この変更で実際に壊れうる」で書く。
 *
 * 上から順に評価するが、同じ観点に複数当たっても観点は 1 つに畳まれる（理由は全部残す）。
 */
const RULES: readonly Rule[] = [
  {
    key: 'compatibility',
    reason: 'API 契約を変更した',
    pattern: /^packages\/contract\/src\//u,
  },
  {
    key: 'compatibility',
    reason: '公開している OpenAPI が変わった',
    pattern: /^docs\/openapi\.json$/u,
  },
  {
    key: 'compatibility',
    reason: 'DB スキーマを変更した',
    pattern: /^packages\/db\/(?:src\/|migrations\/)/u,
  },
  {
    key: 'security',
    reason: '認可のスコープが効く層を変更した',
    pattern: /^apps\/api\/src\/(?:repositories|rpc)\//u,
  },
  {
    key: 'security',
    reason: '認証・CORS を変更した',
    pattern: /^apps\/api\/src\/(?:lib\/(?:auth|cors)\.ts|env(?:-check)?\.ts)$/u,
  },
  {
    key: 'security',
    reason: '入力スキーマを変更した',
    pattern: /^packages\/contract\/src\//u,
  },
  {
    key: 'security',
    reason: '依存または CI の権限が変わった',
    pattern: /^(?:package\.json|bunfig\.toml|mise\.toml|\.github\/workflows\/)/u,
  },
  {
    key: 'reliability',
    reason: '外部 I/O を持つ層を変更した',
    pattern: /^(?:apps\/api\/src\/|apps\/web\/src\/lib\/)/u,
  },
  {
    key: 'performance-efficiency',
    reason: 'クエリを発行する層を変更した',
    pattern: /^(?:apps\/api\/src\/repositories\/|packages\/db\/src\/)/u,
  },
  {
    key: 'safety',
    reason: 'マイグレーションを追加・変更した',
    pattern: /^packages\/db\/migrations\//u,
  },
  {
    key: 'interaction-capability',
    reason: '利用者に見える画面を変更した',
    pattern: /^apps\/web\/src\//u,
  },
  {
    key: 'flexibility',
    reason: '環境ごとの設定・デプロイ構成を変更した',
    pattern:
      /^(?:apps\/[^/]+\/wrangler\.jsonc|apps\/[^/]+\/package\.json|mise\.toml|\.github\/workflows\/)/u,
  },
];

/**
 * 上限を超えたときにどれを残すかの順序。危険な順。
 *
 * 落としたものは捨てずに `deferred` として返す。黙って消すと、レビュー層に
 * 「見ていないのに見たことになる」経路ができる。
 */
const PRIORITY: readonly DimensionKey[] = [
  'security',
  'safety',
  'compatibility',
  'reliability',
  'performance-efficiency',
  'interaction-capability',
  'flexibility',
];

export type RoutedDimension = {
  readonly dimension: Dimension;
  readonly reasons: readonly string[];
};

export type ReviewPlan = {
  /** 今回起動する観点。常設 2 件を先頭に置く。 */
  readonly selected: readonly RoutedDimension[];
  /** 該当はするが上限を超えたため今回は起動しない観点。 */
  readonly deferred: readonly RoutedDimension[];
};

function dimensionOf(key: DimensionKey): Dimension {
  const found = DIMENSIONS.find((dimension) => dimension.key === key);
  if (found === undefined) {
    // dimensions.ts と RULES / PRIORITY のキーがずれた状態。黙って観点を落とすより落とす。
    throw new Error(`未定義の品質特性: ${key}`);
  }
  return found;
}

/** 当たった条件付き観点を「キー → 理由の集合」に畳む。 */
function matchedReasons(changed: readonly string[]): Map<DimensionKey, string[]> {
  const matched = new Map<DimensionKey, string[]>();
  for (const rule of RULES) {
    const hits = changed.filter((path) => rule.pattern.test(path.replaceAll('\\', '/')));
    if (hits.length === 0) {
      continue;
    }
    const reason = `${rule.reason}（${hits[0] ?? ''}${hits.length > 1 ? ` ほか ${hits.length - 1} 件` : ''}）`;
    matched.set(rule.key, [...(matched.get(rule.key) ?? []), reason]);
  }
  return matched;
}

const alwaysDimensions = (): RoutedDimension[] =>
  DIMENSIONS.filter((dimension) => dimension.always).map((dimension) => ({
    dimension,
    reasons: ['変更の内容によらず常に確認する'],
  }));

export function routeReview(
  changed: readonly string[],
  limit: number = MAX_CONDITIONAL,
): ReviewPlan {
  if (changed.length === 0) {
    return { selected: [], deferred: [] };
  }

  const matched = matchedReasons(changed);
  const conditional = PRIORITY.filter((key) => matched.has(key)).map((key) => ({
    dimension: dimensionOf(key),
    reasons: matched.get(key) ?? [],
  }));

  return {
    selected: [...alwaysDimensions(), ...conditional.slice(0, limit)],
    deferred: conditional.slice(limit),
  };
}
