import { describe, expect, it } from 'vitest';

import { adviceFor, formatAdvice, parseEditedPaths } from './edit-advice.ts';

const ROOT = 'd:/Shion/work2/AI-Coding/seri-base-ts-project';

/** 助言を理由だけに潰して比較しやすくする。 */
function reasonsOf(filePaths: readonly string[]): string[] {
  return adviceFor(filePaths).map((advice) => advice.reason);
}

describe('parseEditedPaths', () => {
  it('tool_input.file_path を読む', () => {
    expect(parseEditedPaths('{"tool_input":{"file_path":"/a/b.ts"}}')).toEqual(['/a/b.ts']);
  });

  it('file_path が無ければ空を返す', () => {
    expect(parseEditedPaths('{"tool_input":{}}')).toEqual([]);
  });

  it('tool_input が無くても例外にしない', () => {
    expect(parseEditedPaths('{"tool_name":"Bash"}')).toEqual([]);
  });

  it('file_path が文字列でなければ無視する', () => {
    expect(parseEditedPaths('{"tool_input":{"file_path":42}}')).toEqual([]);
  });

  it('壊れた JSON でも例外にせず空を返す', () => {
    expect(parseEditedPaths('not json')).toEqual([]);
    expect(parseEditedPaths('null')).toEqual([]);
  });
});

describe('adviceFor', () => {
  it('契約を変えたら OpenAPI の再生成を促す', () => {
    expect(reasonsOf([`${ROOT}/packages/contract/src/todo.ts`])).toEqual([
      'API 契約を変更しました',
    ]);
  });

  it('DB スキーマを変えたらマイグレーション生成を促す', () => {
    expect(reasonsOf([`${ROOT}/packages/db/src/schema.ts`])).toEqual(['DB スキーマを変更しました']);
  });

  it('しきい値を変えたら README と ADR への追記を促す', () => {
    expect(reasonsOf([`${ROOT}/tooling/quality-gates/src/index.ts`])).toEqual([
      '品質ゲートのしきい値かポリシーを変更しました',
    ]);
  });

  it('Windows の \\ 区切りでも判定できる', () => {
    expect(reasonsOf(['d:\\Shion\\repo\\packages\\contract\\src\\todo.ts'])).toEqual([
      'API 契約を変更しました',
    ]);
  });

  it('該当しないファイルでは何も促さない', () => {
    expect(reasonsOf([`${ROOT}/apps/web/src/main.tsx`, `${ROOT}/README.md`])).toEqual([]);
  });

  it('テストと型テストでは促さない（生成物に影響しない）', () => {
    expect(reasonsOf([`${ROOT}/packages/contract/src/todo.test.ts`])).toEqual([]);
    expect(reasonsOf([`${ROOT}/packages/contract/src/todo.test-d.ts`])).toEqual([]);
  });

  it('似た名前のパスを誤って拾わない', () => {
    expect(reasonsOf([`${ROOT}/apps/api/src/contract/src/todo.ts`])).toEqual([]);
    expect(reasonsOf([`${ROOT}/packages/contract/README.md`])).toEqual([]);
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
