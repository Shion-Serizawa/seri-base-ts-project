import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { contextOf, makeTempRepo } from '../../test/temp-repo.ts';
import { checkLayerBoundary } from './layer-boundary.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

/**
 * 実物の `.oxlintrc.json` を持ち込んだ擬似リポジトリ。
 *
 * 層のポリシーは「6 ブロックの出現順・対象ファイル・許可先の完全一致」なので、
 * フィクスチャを手書きすると実物とは別のものを検査することになる。
 */
function repoWithConfig(edit: (config: string) => string = (config) => config): string {
  return makeTempRepo({
    '.oxlintrc.json': edit(readFileSync(join(REPO_ROOT, '.oxlintrc.json'), 'utf8')),
    'tooling/quality-gates/oxlint-base.json': readFileSync(
      join(REPO_ROOT, 'tooling/quality-gates/oxlint-base.json'),
      'utf8',
    ),
  });
}

function detailsOf(root: string): string {
  const [result] = checkLayerBoundary(contextOf(root));
  return (result?.details ?? []).join('');
}

function isOk(root: string): boolean {
  return checkLayerBoundary(contextOf(root))[0]?.ok === true;
}

function replaceOnce(source: string, from: string, to: string): string {
  expect(source).toContain(from);
  return source.replace(from, to);
}

describe('checkLayerBoundary', () => {
  it('実物の設定では PASS する', () => {
    expect(isOk(repoWithConfig())).toBe(true);
  });

  it('設定が無ければ「計測不能」で FAIL する', () => {
    const root = makeTempRepo({ 'package.json': '{}' });

    expect(isOk(root)).toBe(false);
    expect(detailsOf(root)).toContain('.oxlintrc.json');
  });

  it('許可先を 1 つ足すと FAIL する', () => {
    // 境界に詰まったときの最短の修復手段がこれ。lint はこれで黙る
    const root = repoWithConfig((config) =>
      replaceOnce(
        config,
        '"message": "web が依存できるのは contract / domain だけ',
        '"message": "web が依存できるのは contract / domain と db だけ',
      ).replace(
        '                  "!@seri/domain",\n                  "!@seri/domain/**"\n                ],\n                "message": "web が依存できるのは',
        '                  "!@seri/domain",\n                  "!@seri/domain/**",\n                  "!@seri/db",\n                  "!@seri/db/**"\n                ],\n                "message": "web が依存できるのは',
      ),
    );

    expect(detailsOf(root)).toContain('層の対象ファイルと許可先');
  });

  it('サブパスの遮断（@seri/*/**）を落とすと FAIL する', () => {
    // これが無いと `@seri/db/schema` が素通りする（過去に実際に起きた）
    const root = repoWithConfig((config) =>
      replaceOnce(config, '"@seri/*",\n                  "@seri/*/**",', '"@seri/*",'),
    );

    expect(detailsOf(root)).toContain('ワークスペース全体の遮断パターン');
  });

  it('生の Drizzle テーブルに触れる範囲を広げると FAIL する', () => {
    const root = repoWithConfig((config) =>
      replaceOnce(
        config,
        '"files": ["apps/api/src/repositories/*-table.ts", "apps/api/src/lib/auth.ts"],',
        '"files": ["apps/api/src/**"],',
      ),
    );

    expect(detailsOf(root)).toContain('生の Drizzle テーブルに触れる範囲');
  });

  it('patterns を空にすると形が崩れたものとして FAIL する', () => {
    const root = repoWithConfig((config) =>
      replaceOnce(
        config,
        '"group": ["@seri/*", "@seri/*/**"],\n                "message": "contract は最下層。他のワークスペースに依存できない"',
        '"group": [],\n                "message": "contract は最下層。他のワークスペースに依存できない"',
      ),
    );

    expect(detailsOf(root)).toContain('null');
  });
});
