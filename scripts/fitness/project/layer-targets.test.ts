import { contextOf, makeTempRepo } from '@seri/base-tooling/test';
import { describe, expect, it } from 'vitest';

import { checkLayerTargets } from './layer-targets.ts';

/**
 * 実物の宣言（`layer-policy.ts`）が当たる形の擬似リポジトリ。
 *
 * 宣言側はフィクスチャで差し替えない。差し替えると「実物の宣言が実物のファイルに
 * 当たっているか」ではなく、テスト用に書いた宣言を検査することになる。
 */
function healthyRoot(overrides: Readonly<Record<string, string>> = {}): string {
  return makeTempRepo({
    'package.json': '{}',
    'packages/contract/src/todo.ts': 'export const a = 1;\n',
    'packages/domain/src/todo.ts': 'export const a = 1;\n',
    'packages/db/src/schema.ts': 'export const a = 1;\n',
    'apps/api/src/app.ts': 'export const a = 1;\n',
    'apps/api/src/lib/auth.ts': 'export const a = 1;\n',
    'apps/api/src/repositories/todo-table.ts': 'export const a = 1;\n',
    'apps/web/src/main.ts': 'export const a = 1;\n',
    ...overrides,
  });
}

function resultOf(
  root: string,
  patterns?: readonly string[],
): ReturnType<typeof checkLayerTargets> {
  return patterns === undefined
    ? checkLayerTargets(contextOf(root))
    : checkLayerTargets(contextOf(root), patterns);
}

function detailsOf(root: string, patterns?: readonly string[]): string {
  return (resultOf(root, patterns).details ?? []).join('\n');
}

describe('checkLayerTargets', () => {
  it('宣言したパターンがすべて実ファイルに当たれば PASS する', () => {
    expect(resultOf(healthyRoot()).ok).toBe(true);
  });

  it('実物のリポジトリでも PASS する', () => {
    // 擬似リポジトリだけで検証すると、宣言と実物のレイアウトがずれたことに気づけない
    expect(checkLayerTargets().ok).toBe(true);
  });

  it('テーブル境界の対象が 1 件も無くなると FAIL する', () => {
    // 派生がサンプルの Todo を置き換える途中で必ず通る状態。
    // ⑦ ⑭ は宣言と .oxlintrc.json が一致したままなので緑で通ってしまう
    const root = makeTempRepo({
      'package.json': '{}',
      'packages/contract/src/todo.ts': 'export const a = 1;\n',
      'packages/domain/src/todo.ts': 'export const a = 1;\n',
      'packages/db/src/schema.ts': 'export const a = 1;\n',
      'apps/api/src/app.ts': 'export const a = 1;\n',
      'apps/api/src/lib/auth.ts': 'export const a = 1;\n',
      'apps/web/src/main.ts': 'export const a = 1;\n',
    });

    expect(resultOf(root).ok).toBe(false);
    expect(detailsOf(root)).toContain('apps/api/src/repositories/*-table.ts');
  });

  it('ソースが 1 件も無ければ「計測不能」で FAIL する', () => {
    const root = makeTempRepo({ 'package.json': '{}' });

    expect(resultOf(root).ok).toBe(false);
    expect(detailsOf(root)).toContain('1 件も無い');
  });

  it('ディレクトリ側にワイルドカードを持つ形は FAIL に倒す', () => {
    // 扱えない形を素通しすると、この検査自体が黙って何も見なくなる
    const root = healthyRoot({ 'apps/api/src/worker.ts': 'export const a = 1;\n' });

    expect(resultOf(root, ['apps/*/src/worker.ts']).ok).toBe(false);
  });

  it('`*` が 2 つ以上ある形も FAIL に倒す', () => {
    const root = healthyRoot({ 'apps/api/src/a-b-c.ts': 'export const a = 1;\n' });

    expect(resultOf(root, ['apps/api/src/*-*-c.ts']).ok).toBe(false);
  });

  it('拡張子まで一致しなければ当たったことにしない', () => {
    const root = healthyRoot();

    expect(resultOf(root, ['apps/api/src/repositories/*-table.tsx']).ok).toBe(false);
  });

  it('サブディレクトリのファイルを `*` で拾わない', () => {
    // `apps/api/src/*.ts` は直下だけ。深い階層まで拾うと、境界の広さを誤って報告する
    const root = makeTempRepo({
      'package.json': '{}',
      'apps/api/src/lib/auth.ts': 'export const a = 1;\n',
    });

    expect(resultOf(root, ['apps/api/src/*.ts']).ok).toBe(false);
  });

  it('リテラルのパスは完全一致で見る', () => {
    const root = healthyRoot();

    expect(resultOf(root, ['apps/api/src/lib/auth.ts']).ok).toBe(true);
    expect(resultOf(root, ['apps/api/src/lib/auth-client.ts']).ok).toBe(false);
  });

  it('落ちたパターンを details に並べ、次にやることを書く', () => {
    const root = makeTempRepo({
      'package.json': '{}',
      'apps/api/src/app.ts': 'export const a = 1;\n',
    });
    const details = detailsOf(root, ['packages/contract/src/**']);

    expect(details).toContain('packages/contract/src/**');
    expect(details).toContain('layer-policy.ts');
  });
});
