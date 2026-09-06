import type { ReviewPlan, RoutedDimension } from './route.ts';

/**
 * ルーターの結果を、サブエージェントにそのまま渡せる形に整える。
 *
 * 観点ごとに独立したコンテキストで読ませる前提なので、1 観点分のブロックが
 * それ単体で完結している（他の観点を読まないと意味が通らない書き方をしない）。
 */

/**
 * 名前の付いた症状の一覧。持っている観点にだけ出す。
 *
 * 「リポジトリの規約が優先する」「すべて判断であって違反ではない」の 2 つを
 * 毎回添える。添えないと、症状の名前が独り歩きして規約より強く読まれる。
 */
function baselineLines(dimension: RoutedDimension['dimension']): string[] {
  if (dimension.baseline === undefined) {
    return [];
  }
  return [
    '名前の付いた症状（見落としを防ぐための語彙。**すべて判断であって違反ではない**）:',
    ...dimension.baseline.map((smell) => `- ${smell.name}: ${smell.symptom} → ${smell.fix}`),
    '',
    'リポジトリの規約（README / ADR / lint 設定）が是としている書き方は、',
    'ここに当てはまっても指摘しない。規約の側が正しい。',
    '',
  ];
}

function block(routed: RoutedDimension): string[] {
  const { dimension } = routed;
  return [
    `## ${dimension.name} (${dimension.key})`,
    '',
    '起動理由:',
    ...routed.reasons.map((reason) => `- ${reason}`),
    '',
    '見る観点:',
    ...dimension.focus.map((line) => `- ${line}`),
    '',
    ...baselineLines(dimension),
    '証拠として出すもの（主張だけの報告は受け付けない）:',
    ...dimension.evidence.map((line) => `- ${line}`),
    '',
    dimension.coveredByGates.length === 0
      ? '既存ゲートの担当: なし（この観点は決定論的ゲートが 1 つも見ていない）'
      : `既存ゲートが見ている（重複して指摘しない）: ${dimension.coveredByGates.join(' / ')}`,
    '',
  ];
}

export function formatPlan(plan: ReviewPlan, changed: readonly string[]): string[] {
  if (plan.selected.length === 0) {
    return ['変更されたファイルが無いため、レビューする観点はありません。'];
  }

  const deferred =
    plan.deferred.length === 0
      ? []
      : [
          '# 今回は起動しない観点（上限を超えたため）',
          '',
          ...plan.deferred.map(
            (routed) => `- ${routed.dimension.name}: ${routed.reasons[0] ?? ''}`,
          ),
          '',
          '該当はしています。上を片付けてから、必要なら個別に起動してください。',
          '',
        ];

  return [
    `# レビュー計画（変更 ${changed.length} ファイル / 観点 ${plan.selected.length} 件）`,
    '',
    '観点ごとに独立したサブエージェントで確認します。',
    '',
    ...plan.selected.flatMap(block),
    ...deferred,
  ];
}
