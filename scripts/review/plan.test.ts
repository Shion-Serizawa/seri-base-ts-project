import { describe, expect, it } from 'vitest';

import { formatPlan } from './plan.ts';
import { routeReview } from './route.ts';

const WIDE = [
  'packages/contract/src/todo.ts',
  'apps/api/src/repositories/todo-repository.ts',
  'packages/db/migrations/0001_drop.sql',
  'apps/web/src/features/todos/todo-list.tsx',
  'apps/web/wrangler.jsonc',
];

function render(changed: readonly string[]): string {
  return formatPlan(routeReview(changed), changed).join('\n');
}

describe('formatPlan', () => {
  it('変更が無ければその旨だけを返す', () => {
    expect(formatPlan(routeReview([]), [])).toStrictEqual([
      '変更されたファイルが無いため、レビューする観点はありません。',
    ]);
  });

  it('見出しに変更ファイル数と観点数を出す', () => {
    expect(render(['apps/web/src/features/todos/todo-list.tsx'])).toContain(
      '変更 1 ファイル / 観点 3 件',
    );
  });

  it('観点ごとに起動理由・観点・証拠を出す', () => {
    const output = render(['packages/db/migrations/0001_drop.sql']);

    expect(output).toContain('## 安全性 (safety)');
    expect(output).toContain('起動理由:');
    expect(output).toContain('見る観点:');
    expect(output).toContain('証拠として出すもの');
  });

  it('既存ゲートが見ている項目を明示して二重の指摘を防ぐ', () => {
    expect(render(['packages/db/migrations/0001_drop.sql'])).toContain(
      '既存ゲートが見ている（重複して指摘しない）:',
    );
  });

  it('ゲートが 1 つも無い観点はその旨を出す', () => {
    const output = render(['apps/api/src/app.ts']);

    expect(output).toContain('決定論的ゲートが 1 つも見ていない');
  });

  it('上限で落ちた観点を「今回は起動しない観点」として残す', () => {
    const output = render(WIDE);

    expect(output).toContain('# 今回は起動しない観点（上限を超えたため）');
    expect(output).toContain('- 信頼性:');
  });

  it('該当が上限以下なら「起動しない観点」の節を出さない', () => {
    expect(render(['apps/web/src/features/todos/todo-list.tsx'])).not.toContain(
      '今回は起動しない観点',
    );
  });

  it('保守性にはコードスメルの一覧を添える', () => {
    const output = render(['packages/domain/src/todo.ts']);

    expect(output).toContain('Feature Envy');
    expect(output).toContain('Primitive Obsession');
    expect(output).toContain('すべて判断であって違反ではない');
  });

  it('スメルにはリポジトリの規約が優先することを毎回添える', () => {
    expect(render(['packages/domain/src/todo.ts'])).toContain('規約の側が正しい');
  });

  it('スメルを持たない観点には一覧を出さない', () => {
    const output = render(['apps/api/src/app.ts']);
    const reliability = output.slice(output.indexOf('## 信頼性'));

    expect(reliability).not.toContain('Feature Envy');
  });

  it('常設の 2 観点は必ず出る', () => {
    const output = render(['README.md']);

    expect(output).toContain('## 機能適合性 (functional-suitability)');
    expect(output).toContain('## 保守性 (maintainability)');
  });
});
