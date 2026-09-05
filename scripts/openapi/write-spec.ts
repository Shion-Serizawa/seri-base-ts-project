import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildOpenApiDocument, OPENAPI_SPEC_PATH, serializeOpenApiDocument } from './document.ts';

// `process.cwd()` 基準だと、ルート以外から叩いたときにそのディレクトリ配下へ
// 書き出してしまい、本体は古いまま ⑫ が FAIL する（原因が分かりにくい）。
// このファイルは `<root>/scripts/openapi/` にあるので、そこから遡って求める。
const path = fileURLToPath(new URL(`../../${OPENAPI_SPEC_PATH}`, import.meta.url));
writeFileSync(path, serializeOpenApiDocument(await buildOpenApiDocument()), 'utf8');
console.log(`OpenAPI ドキュメントを生成しました: ${OPENAPI_SPEC_PATH}`);
