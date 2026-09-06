import { describe, expect, it } from 'vitest';

import { a11yViolations } from './a11y.ts';

/**
 * a11y ヘルパ自身の検査。
 *
 * ルールの絞り込み（WCAG タグ・color-contrast の無効化）をやりすぎると、
 * 何を描画しても空配列を返すヘルパになる。そうなると各コンポーネントの
 * a11y テストは全部緑のまま無意味になるので、**検出できること**を固定する。
 */
function renderHtml(html: string): Element {
  document.body.innerHTML = html;
  return document.body;
}

describe('a11yViolations', () => {
  it('名前の無いフォーム部品を検出する', async () => {
    const violations = await a11yViolations(renderHtml('<input type="checkbox" />'));

    expect(violations.join('\n')).toContain('label');
  });

  it('テキストの無いリンクを検出する', async () => {
    const violations = await a11yViolations(renderHtml('<a href="/todos"></a>'));

    expect(violations.join('\n')).toContain('link-name');
  });

  it('問題の無いマークアップでは空配列を返す', async () => {
    const violations = await a11yViolations(
      renderHtml('<label>やること<input type="checkbox" /></label>'),
    );

    expect(violations).toStrictEqual([]);
  });
});
