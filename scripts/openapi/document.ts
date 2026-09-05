import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { apiContract } from '@seri/contract';

/** 生成した仕様の出力先（リポジトリルートからの相対パス）。 */
export const OPENAPI_SPEC_PATH = 'docs/openapi.json';

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

/**
 * `@seri/contract` の API 契約から OpenAPI ドキュメントを生成する。
 *
 * 実装（apps/api）ではなく**契約**から生成しているのが要点。
 * 契約は既に入出力スキーマとエラーの種類を持っているので、
 * ドキュメント専用のアノテーションを別途書く必要がなく、
 * 契約とドキュメントが食い違うことがない。
 *
 * 生成物は `docs/openapi.json` にコミットし、契約との乖離を適応度関数 ⑫ が検出する
 * （スキーマとマイグレーションの関係（⑩）と同じ構図）。
 */
export async function buildOpenApiDocument(): Promise<Record<string, unknown>> {
  const document = await generator.generate(apiContract, {
    info: {
      title: 'seri-base API',
      version: '0.0.0',
      description:
        'oRPC の contract-first な API 契約から生成。実際の転送は /api/rpc 配下の oRPC プロトコルで行う。',
    },
    servers: [{ url: 'http://localhost:8787/api/rpc' }],
  });
  return { ...document };
}

/** ファイルに書き出す形（末尾改行つきの整形 JSON）。 */
export function serializeOpenApiDocument(document: Record<string, unknown>): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
