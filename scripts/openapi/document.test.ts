import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument, serializeOpenApiDocument } from './document.ts';

const document = await buildOpenApiDocument();
const json = JSON.stringify(document);

/** 型アサーションを使わずにオブジェクトのキーを取り出す。 */
function keysOf(value: unknown): string[] {
  return typeof value === 'object' && value !== null ? Object.keys(value) : [];
}

describe('buildOpenApiDocument', () => {
  it('OpenAPI 3.1 のドキュメントを返す', () => {
    expect(document['openapi']).toMatch(/^3\.1\./u);
  });

  it('契約のすべての手続きが載る', () => {
    const paths = keysOf(document['paths']);

    expect(paths.toSorted()).toStrictEqual([
      '/todo/create',
      '/todo/list',
      '/todo/remove',
      '/todo/setDone',
    ]);
  });

  it('契約で宣言した型付きエラーが載る（UNAUTHORIZED / NOT_FOUND / BLANK_TITLE）', () => {
    expect(json).toContain('UNAUTHORIZED');
    expect(json).toContain('NOT_FOUND');
    expect(json).toContain('BLANK_TITLE');
  });

  it('zod の制約がスキーマに反映される（title は 1..200 文字）', () => {
    expect(json).toContain('"maxLength":200');
  });

  it('branded type の TodoId は uuid 形式として出る', () => {
    expect(json).toContain('"format":"uuid"');
  });

  it('転送先が分かるよう servers を持つ', () => {
    expect(JSON.stringify(document['servers'])).toContain('/api/rpc');
  });
});

describe('serializeOpenApiDocument', () => {
  it('2 スペース整形で末尾に改行を付ける（差分を安定させる）', () => {
    const text = serializeOpenApiDocument({ a: { b: 1 } });

    expect(text).toBe('{\n  "a": {\n    "b": 1\n  }\n}\n');
  });

  it('同じ契約からは常に同じ文字列になる', async () => {
    expect(serializeOpenApiDocument(await buildOpenApiDocument())).toBe(
      serializeOpenApiDocument(await buildOpenApiDocument()),
    );
  });
});
