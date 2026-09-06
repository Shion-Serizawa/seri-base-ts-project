import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FitnessContext } from '@seri/base-tooling/fitness/context';
import { defaultContext } from '@seri/base-tooling/fitness/context';
import type { CheckResult } from '@seri/base-tooling/fitness/report';
import { isTestFile, listSourceFiles } from '@seri/base-tooling/fitness/walk';

const CONTRACT_SOURCE = join('packages', 'contract', 'src');
const API_SOURCE = join('apps', 'api', 'src');

/** 契約で宣言したエラー名を拾うための `.errors(` の位置。 */
const ERRORS_CALL = /\.errors\(/gu;

/** `errors.NOT_FOUND()` のような送出。 */
const ERRORS_THROW = /\berrors\.([A-Z][A-Z0-9_]*)\s*\(/gu;

/**
 * `.errors({ ... })` の中のエラー名。
 *
 * 大文字のキーだけを拾うので、入れ子の `{ message: '...' }` は自然に除外される。
 */
const ERROR_KEY = /(?:^|[{,\s])([A-Z][A-Z0-9_]*)\s*:/gu;

/** `from` 以降の最初の `{` から対応する `}` までの中身を返す。対応が取れなければ空。 */
function balancedBlock(text: string, from: number): string {
  const open = text.indexOf('{', from);
  if (open === -1) {
    return '';
  }
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const character = text[index];
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(open + 1, index);
      }
    }
  }
  return '';
}

/** 契約が宣言しているエラー名。 */
function declaredErrors(text: string): string[] {
  return [...text.matchAll(ERRORS_CALL)].flatMap((match) => {
    const block = balancedBlock(text, match.index + match[0].length);
    return [...block.matchAll(ERROR_KEY)].map((key) => key[1] ?? '');
  });
}

/** 実装が送出しているエラー名。 */
function thrownErrors(text: string): string[] {
  return [...text.matchAll(ERRORS_THROW)].map((match) => match[1] ?? '');
}

/** ディレクトリ配下の実装ソース（テストを除く）を連結して読む。 */
function readSources(root: string, directory: string): { text: string; count: number } {
  const files = listSourceFiles(join(root, directory)).filter((file) => !isTestFile(file));
  return {
    text: files.map((file) => readFileSync(file, 'utf8')).join('\n'),
    count: files.length,
  };
}

function failure(name: string, actual: string, expected: string, details: string[]): CheckResult {
  return { name, ok: false, actual, expected, details };
}

/**
 * 適応度関数 ⑮ 契約エラーの乖離。
 *
 * 契約（`packages/contract`）が宣言したエラーのうち、実装（`apps/api`）が
 * 一度も送出しないものを検出する。
 *
 * 逆向き（宣言していないエラーの送出）は oRPC の型が落とすので見ない。
 * 見られないのは「宣言した側が実装されていない」方向で、これは型検査にも
 * テストにも現れない。クライアントは契約から `NOT_FOUND` を受け取る前提の分岐を書き、
 * サーバはそれを一度も返さない、という無言の食い違いが残る。
 *
 * 限界: エラー名の集合として突き合わせるので、手続き A に宣言したエラーを
 * 手続き B が送出している場合は見抜けない。手続き単位の対応は型と
 * `router.test.ts` の統合テストが担保する。
 */
export function checkContractErrorDrift(context: FitnessContext = defaultContext()): CheckResult {
  const name = 'contract error drift';
  const expected = '契約のエラーがすべて実装で送出される';

  const contract = readSources(context.root, CONTRACT_SOURCE);
  const api = readSources(context.root, API_SOURCE);

  // 「対象が無いので違反も無い」を PASS にすると、ディレクトリを移した瞬間に
  // このゲートが常に緑になる（false green）。
  if (contract.count === 0 || api.count === 0) {
    return failure(name, '対象なし（計測不能）', expected, [
      `${CONTRACT_SOURCE} と ${API_SOURCE} の実装ソースを探したが`,
      `契約 ${contract.count} 件 / 実装 ${api.count} 件だった。パスの変更なら検査側も直す`,
    ]);
  }

  const declared = new Set(declaredErrors(contract.text));
  if (declared.size === 0) {
    // 契約から `.errors()` が消えた（あるいは記法が変わった）状態を緑にしない。
    return failure(name, 'エラー宣言 0 件（計測不能）', expected, [
      '契約に `.errors({ ... })` が 1 つも無い。記法を変えたなら検査側の正規表現も直す',
    ]);
  }

  const thrown = new Set(thrownErrors(api.text));
  const unused = [...declared].filter((code) => !thrown.has(code)).toSorted();

  return {
    name,
    ok: unused.length === 0,
    actual: unused.length === 0 ? `${declared.size} 種すべて送出` : `未実装 ${unused.length} 種`,
    expected,
    ...(unused.length > 0
      ? {
          details: [
            ...unused.map((code) => `契約の ${code} を apps/api が一度も送出していない`),
            '実装するか、契約から宣言を外す（クライアントの分岐が空振りする）',
          ],
        }
      : {}),
  };
}
