import axe from 'axe-core';

/**
 * レイアウト計算を必要とし、happy-dom では判定できないルール。
 *
 * 無効にした分は「検査していない」ので、見た目のコントラストは
 * このゲートの守備範囲外。静的な JSX の不備は oxlint の jsx-a11y が見る。
 */
const NEEDS_REAL_LAYOUT = ['color-contrast'] as const;

/**
 * 適用するルールの範囲。WCAG の達成基準に対応するものだけに絞る。
 *
 * axe の既定にはページ全体を前提にした best-practice ルール（`region` など）が含まれ、
 * コンポーネント単体を描画したテストでは必ず違反する。全部を対象にすると
 * 「落ちるのが当たり前」になり、抑制のためのオプションが増えていく。
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

/**
 * 適応度関数 ⑱ アクセシビリティ。描画済み DOM の違反を `ルール名: 件数` の配列で返す。
 *
 * `expect` をこの中で呼ばないのは、アサーションをテスト側に置くため
 * （`vitest/expect-expect` と `vitest/no-standalone-expect` の建前を崩さない）。
 *
 * 検出できるのは「名前の無いフォーム部品」「重複した id」「aria の参照切れ」など、
 * lint では見えない**組み立てた後の DOM の性質**。
 */
export async function a11yViolations(container: Element = document.body): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: [...WCAG_TAGS] },
    rules: Object.fromEntries(NEEDS_REAL_LAYOUT.map((id) => [id, { enabled: false }])),
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.nodes.length} 箇所`);
}
