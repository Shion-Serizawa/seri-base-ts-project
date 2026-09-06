import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { adviceFor, formatAdvice, parseEditedPaths } from './edit-advice.ts';

/**
 * リポジトリのルート。固定文字列にしていたものを実際の位置から求めるように変えた。
 *
 * 助言のルールが指すパスは、**実在しなければ永久に発火しない**。
 * 実際に `tooling/quality-gates/src/**` を指したまま実体が A 層へ移動した時期があり、
 * このテストも同じ古いパスで「発火する」ことを検証していたため緑のまま通っていた。
 * ゲートが黙って緑になるのと同じ壊れ方なので、実在の確認を助言の検証と同じ表に置く。
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
  .replaceAll('\\', '/')
  .replace(/\/$/u, '');

/** 助言を理由だけに潰して比較しやすくする。 */
function reasonsOf(filePaths: readonly string[]): string[] {
  return adviceFor(filePaths).map((advice) => advice.reason);
}

describe('parseEditedPaths', () => {
  it('tool_input.file_path を読む', () => {
    expect(parseEditedPaths('{"tool_input":{"file_path":"/a/b.ts"}}')).toStrictEqual(['/a/b.ts']);
  });

  it('file_path が無ければ空を返す', () => {
    expect(parseEditedPaths('{"tool_input":{}}')).toStrictEqual([]);
  });

  it('tool_input が無くても例外にしない', () => {
    expect(parseEditedPaths('{"tool_name":"Bash"}')).toStrictEqual([]);
  });

  it('file_path が文字列でなければ無視する', () => {
    expect(parseEditedPaths('{"tool_input":{"file_path":42}}')).toStrictEqual([]);
  });

  it('壊れた JSON でも例外にせず空を返す', () => {
    expect(parseEditedPaths('not json')).toStrictEqual([]);
    expect(parseEditedPaths('null')).toStrictEqual([]);
  });
});

describe('adviceFor', () => {
  it.each([
    ['packages/contract/src/todo.ts', 'API 契約を変更しました'],
    ['packages/db/src/schema.ts', 'DB スキーマを変更しました'],
    ['stryker.config.json', '品質ゲートのしきい値（二重管理している側）を変更しました'],
    ['.jscpd.json', '品質ゲートのしきい値（二重管理している側）を変更しました'],
    ['scripts/fitness/project/layer-policy.ts', '層の依存方向か認可スコープの境界を変更しました'],
  ])('%s は実在し、その編集が助言を発火させる', (relative, reason) => {
    expect(existsSync(`${ROOT}/${relative}`)).toBe(true);
    expect(reasonsOf([`${ROOT}/${relative}`])).toStrictEqual([reason]);
  });

  it('Windows の \\ 区切りでも判定できる', () => {
    expect(reasonsOf(['d:\\Shion\\repo\\packages\\contract\\src\\todo.ts'])).toStrictEqual([
      'API 契約を変更しました',
    ]);
  });

  it('該当しないファイルでは何も促さない', () => {
    expect(reasonsOf([`${ROOT}/apps/web/src/main.tsx`, `${ROOT}/README.md`])).toStrictEqual([]);
  });

  it('テストと型テストでは促さない（生成物に影響しない）', () => {
    expect(reasonsOf([`${ROOT}/packages/contract/src/todo.test.ts`])).toStrictEqual([]);
    expect(reasonsOf([`${ROOT}/packages/contract/src/todo.test-d.ts`])).toStrictEqual([]);
  });

  it('似た名前のパスを誤って拾わない', () => {
    expect(reasonsOf([`${ROOT}/apps/api/src/contract/src/todo.ts`])).toStrictEqual([]);
    expect(reasonsOf([`${ROOT}/packages/contract/README.md`])).toStrictEqual([]);
  });

  it('db の schema.ts 以外では促さない（CLAUDE.md の表と範囲を揃える）', () => {
    expect(reasonsOf([`${ROOT}/packages/db/src/index.ts`])).toStrictEqual([]);
    expect(reasonsOf([`${ROOT}/packages/db/src/client.ts`])).toStrictEqual([]);
  });

  it('同じ助言は 1 件にまとめる', () => {
    const paths = [
      `${ROOT}/packages/contract/src/todo.ts`,
      `${ROOT}/packages/contract/src/endpoints.ts`,
    ];
    expect(adviceFor(paths)).toHaveLength(1);
  });

  it('異なる領域を触ったら両方を促す', () => {
    const paths = [`${ROOT}/packages/contract/src/todo.ts`, `${ROOT}/packages/db/src/schema.ts`];
    expect(reasonsOf(paths)).toHaveLength(2);
  });
});

describe('formatAdvice', () => {
  it('助言を 1 行ずつ並べる', () => {
    const text = formatAdvice(adviceFor([`${ROOT}/packages/db/src/schema.ts`]));
    expect(text).toContain('db:generate');
    expect(text.split('\n')).toHaveLength(1);
  });

  it('助言が無ければ空文字列', () => {
    expect(formatAdvice([])).toBe('');
  });
});
