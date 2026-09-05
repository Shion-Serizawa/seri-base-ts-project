import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildOpenApiDocument,
  OPENAPI_SPEC_PATH,
  serializeOpenApiDocument,
} from '../../openapi/document.ts';
import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';

const NAME = 'openapi drift';
const EXPECTED = '契約と docs/openapi.json が一致';

/** 差分のある最初の行を人が読める形で示す。 */
function firstDifference(expected: string, actual: string): string {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const length = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return [
        `${index + 1} 行目から差分:`,
        `  契約から生成: ${expectedLines[index] ?? '(行なし)'}`,
        `  コミット済み: ${actualLines[index] ?? '(行なし)'}`,
      ].join('\n');
    }
  }
  return '差分なし';
}

/**
 * 適応度関数 ⑫ 契約と OpenAPI ドキュメントの乖離。
 *
 * ⑩ スキーマとマイグレーションの関係と同じ構図。契約を変えたのに
 * `bun run openapi:generate` を忘れると、型検査もテストも通るのに
 * 公開しているドキュメントだけが古いまま、という壊れ方をする。
 * 生成物をコミットしているのは、契約変更が API の破壊的変更かどうかを
 * レビューで差分として見えるようにするため。
 */
export async function checkOpenApiDrift(
  context: FitnessContext = defaultContext(),
): Promise<CheckResult> {
  const path = join(context.root, OPENAPI_SPEC_PATH);
  const generated = serializeOpenApiDocument(await buildOpenApiDocument());

  if (!existsSync(path)) {
    return {
      name: NAME,
      ok: false,
      actual: '未生成',
      expected: EXPECTED,
      details: [`${OPENAPI_SPEC_PATH} が無い。\`bun run openapi:generate\` を実行する`],
    };
  }

  const committed = readFileSync(path, 'utf8');
  if (committed === generated) {
    return { name: NAME, ok: true, actual: '一致', expected: EXPECTED };
  }

  return {
    name: NAME,
    ok: false,
    actual: '契約と乖離',
    expected: EXPECTED,
    details: [
      `${OPENAPI_SPEC_PATH} が契約と一致しない。\`bun run openapi:generate\` を実行してコミットする`,
      ...firstDifference(generated, committed).split('\n'),
    ],
  };
}
