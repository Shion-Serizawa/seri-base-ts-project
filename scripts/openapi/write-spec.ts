import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildOpenApiDocument, OPENAPI_SPEC_PATH, serializeOpenApiDocument } from './document.ts';

const path = resolve(process.cwd(), OPENAPI_SPEC_PATH);
writeFileSync(path, serializeOpenApiDocument(await buildOpenApiDocument()), 'utf8');
console.log(`OpenAPI ドキュメントを生成しました: ${OPENAPI_SPEC_PATH}`);
