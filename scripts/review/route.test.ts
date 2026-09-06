import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DIMENSIONS } from './dimensions.ts';
import type { DimensionKey } from './dimensions.ts';
import { routeReview } from './route.ts';
import { CODE_SMELLS } from './smells.ts';

function keysOf(changed: readonly string[]): DimensionKey[] {
  return routeReview(changed, DIMENSIONS.length).selected.map((routed) => routed.dimension.key);
}

describe('routeReview の常設観点', () => {
  it('変更があれば機能適合性と保守性を必ず含む', () => {
    expect(keysOf(['packages/domain/src/todo.ts'])).toStrictEqual([
      'functional-suitability',
      'maintainability',
    ]);
  });

  it('変更が無ければ観点を返さない', () => {
    expect(routeReview([])).toStrictEqual({ selected: [], deferred: [] });
  });

  it('常設観点は必ず先頭に来る', () => {
    const keys = keysOf(['packages/db/migrations/0001_drop.sql']);

    expect(keys.slice(0, 2)).toStrictEqual(['functional-suitability', 'maintainability']);
  });
});

describe('routeReview の発火条件', () => {
  it.each([
    ['packages/contract/src/todo.ts', 'compatibility'],
    ['docs/openapi.json', 'compatibility'],
    ['packages/db/src/schema.ts', 'compatibility'],
    ['apps/api/src/repositories/todo-repository.ts', 'security'],
    ['apps/api/src/rpc/router.ts', 'security'],
    ['apps/api/src/lib/auth.ts', 'security'],
    ['apps/api/src/lib/cors.ts', 'security'],
    ['apps/api/src/env.ts', 'security'],
    ['.github/workflows/ci.yml', 'security'],
    ['package.json', 'security'],
    ['apps/api/src/app.ts', 'reliability'],
    ['apps/web/src/lib/api-client.ts', 'reliability'],
    ['apps/api/src/repositories/todo-repository.ts', 'performance-efficiency'],
    ['packages/db/migrations/0001_drop.sql', 'safety'],
    ['apps/web/src/features/todos/todo-list.tsx', 'interaction-capability'],
    ['apps/web/wrangler.jsonc', 'flexibility'],
  ] as const)('%s を変えたら %s を起動する', (path, key) => {
    expect(keysOf([path])).toContain(key);
  });

  it.each([
    ['README.md', 'compatibility'],
    ['README.md', 'security'],
    ['docs/adr/0002-fitness-functions.md', 'safety'],
    ['scripts/fitness/collect.ts', 'security'],
    ['packages/domain/src/todo.ts', 'performance-efficiency'],
    ['apps/api/src/repositories/todo-repository.ts', 'interaction-capability'],
  ] as const)('%s を変えても %s は起動しない', (path, key) => {
    expect(keysOf([path])).not.toContain(key);
  });

  it('契約の変更は互換性とセキュリティの両方を起動する', () => {
    const keys = keysOf(['packages/contract/src/todo-contract.ts']);

    expect(keys).toContain('compatibility');
    expect(keys).toContain('security');
  });

  it('マイグレーションは安全性と互換性の両方を起動する', () => {
    const keys = keysOf(['packages/db/migrations/0001_drop.sql']);

    expect(keys).toContain('safety');
    expect(keys).toContain('compatibility');
  });

  it('Windows 区切りのパスでも同じ判定になる', () => {
    expect(keysOf(['packages\\db\\migrations\\0001_drop.sql'])).toContain('safety');
  });

  it('同じ観点に複数当たっても観点は 1 つに畳み、理由は全部残す', () => {
    const plan = routeReview(
      ['apps/api/src/rpc/router.ts', 'apps/api/src/lib/auth.ts', 'package.json'],
      DIMENSIONS.length,
    );
    const security = plan.selected.filter((routed) => routed.dimension.key === 'security');

    expect(security.length).toBe(1);
    expect(security[0]?.reasons.length).toBe(3);
  });

  it('複数ファイルが当たったら理由に件数を出す', () => {
    const plan = routeReview(
      ['apps/web/src/features/a.tsx', 'apps/web/src/features/b.tsx'],
      DIMENSIONS.length,
    );
    const interaction = plan.selected.find(
      (routed) => routed.dimension.key === 'interaction-capability',
    );

    expect(interaction?.reasons[0]).toContain('ほか 1 件');
  });
});

describe('routeReview の上限', () => {
  const wide = [
    'packages/contract/src/todo.ts',
    'apps/api/src/repositories/todo-repository.ts',
    'packages/db/migrations/0001_drop.sql',
    'apps/web/src/features/todos/todo-list.tsx',
    'apps/web/wrangler.jsonc',
  ];

  it('条件付き観点は既定で 3 件までに絞る', () => {
    // 常設 2 件 + 条件付き 3 件。個人開発で 9 本走らせると重すぎて回さなくなる。
    expect(routeReview(wide).selected.length).toBe(5);
  });

  it('上限は引数で変えられる', () => {
    expect(routeReview(wide, 1).selected.length).toBe(3);
    expect(routeReview(wide, 0).selected.length).toBe(2);
  });

  it('危険な順に残す（セキュリティ・安全性・互換性）', () => {
    const plan = routeReview(wide);

    expect(plan.selected.slice(2).map((routed) => routed.dimension.key)).toStrictEqual([
      'security',
      'safety',
      'compatibility',
    ]);
  });

  it('落とした観点は捨てずに deferred で返す（黙って消さない）', () => {
    const plan = routeReview(wide);

    expect(plan.deferred.map((routed) => routed.dimension.key)).toStrictEqual([
      'reliability',
      'performance-efficiency',
      'interaction-capability',
      'flexibility',
    ]);
  });

  it('該当が上限以下なら deferred は空', () => {
    expect(routeReview(['apps/web/src/features/todos/todo-list.tsx']).deferred).toStrictEqual([]);
  });
});

describe('DIMENSIONS の定義', () => {
  it('9 特性すべてを持つ', () => {
    expect(DIMENSIONS.length).toBe(9);
  });

  it('常設は機能適合性と保守性の 2 件だけ', () => {
    expect(DIMENSIONS.filter((dimension) => dimension.always).map((d) => d.key)).toStrictEqual([
      'functional-suitability',
      'maintainability',
    ]);
  });

  it('観点と証拠が空の特性が無い', () => {
    for (const dimension of DIMENSIONS) {
      expect(dimension.focus.length).toBeGreaterThan(0);
      expect(dimension.evidence.length).toBeGreaterThan(0);
    }
  });

  it('コードスメルの基準を持つのは保守性だけ', () => {
    const withBaseline = DIMENSIONS.filter((dimension) => dimension.baseline !== undefined);

    expect(withBaseline.map((dimension) => dimension.key)).toStrictEqual(['maintainability']);
  });

  it('すべてのスメルが名前・症状・直し方を持つ', () => {
    for (const smell of CODE_SMELLS) {
      expect(smell.name.length).toBeGreaterThan(0);
      expect(smell.symptom.length).toBeGreaterThan(0);
      expect(smell.fix.length).toBeGreaterThan(0);
    }
  });

  it('すべてのスメルが docs/quality/iso25010.md に記載されている', () => {
    // 症状の名前が文書とコードでずれると、レビューの指摘と読み物が別物になる。
    const document = readFileSync('docs/quality/iso25010.md', 'utf8');

    for (const smell of CODE_SMELLS) {
      expect(document).toContain(smell.name);
    }
  });

  it('すべての特性が docs/quality/iso25010.md に記載されている', () => {
    // 文書とレビュー観点がずれる壊れ方は誰にも見えない（⑬ と同じ理由）。
    // ⑬ はパスの実在しか見ないので、中身の一致はここで固定する。
    const document = readFileSync('docs/quality/iso25010.md', 'utf8');

    for (const dimension of DIMENSIONS) {
      expect(document).toContain(dimension.key);
      expect(document).toContain(dimension.name);
    }
  });
});
