import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FitnessContext } from '@seri/base-tooling/fitness/context';
import { defaultContext } from '@seri/base-tooling/fitness/context';
import type { CommandOutcome } from '@seri/base-tooling/fitness/exec';
import { outputLines } from '@seri/base-tooling/fitness/exec';
import type { CheckResult } from '@seri/base-tooling/fitness/report';

import { OPENAPI_SPEC_PATH } from '../../openapi/document.ts';

const NAME = 'openapi breaking';
const EXPECTED = '破壊的変更が無い、または宣言済み';
const MAX_DETAIL_LINES = 8;

/**
 * シェルに埋めても解釈が変わらない ref 名。
 * `scripts/mutation/changed.ts` と同じ理由で、git 上は合法でもここでは受け付けない。
 *
 * `~` を許すのは CI が `HEAD~1` を渡すため。`^`（`HEAD^`）は許さない。
 * Windows の cmd.exe ではエスケープ文字として食われて別の ref を指す。
 */
const SAFE_REF = /^[\w./~-]+$/u;

/** Conventional Commits の破壊的変更の宣言（`feat!:` / `fix(scope)!:` / `BREAKING CHANGE:`）。 */
const BREAKING_DECLARATION = /^[a-z]+(?:\([^)]*\))?!:|^BREAKING[ -]CHANGE:/mu;

function fail(actual: string, details: readonly string[]): CheckResult {
  return { name: NAME, ok: false, actual, expected: EXPECTED, details };
}

function pass(actual: string): CheckResult {
  return { name: NAME, ok: true, actual, expected: EXPECTED };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `paths` から「経路」と「操作」のトークンを起こす。 */
function addPathTokens(paths: unknown, out: Set<string>): void {
  if (!isRecord(paths)) {
    return;
  }
  for (const [route, operations] of Object.entries(paths)) {
    out.add(`経路 ${route}`);
    if (isRecord(operations)) {
      for (const method of Object.keys(operations)) {
        out.add(`操作 ${method.toUpperCase()} ${route}`);
      }
    }
  }
}

function keysOf(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

function itemsOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * 公開面として数えるキーと、そこから起こすトークン。
 *
 * ここに無いキーは公開面に数えない（`description` や `default` を変えても
 * 破壊的変更にはならない）。
 */
const TOKEN_SOURCES: Readonly<Record<string, (value: unknown, pointer: string) => string[]>> = {
  properties: (value, pointer) => keysOf(value).map((name) => `フィールド ${pointer}/${name}`),
  responses: (value, pointer) => keysOf(value).map((code) => `応答 ${pointer}/${code}`),
  required: (value, pointer) => itemsOf(value).map((name) => `必須 ${pointer}#${String(name)}`),
  enum: (value, pointer) => itemsOf(value).map((item) => `列挙 ${pointer}#${JSON.stringify(item)}`),
};

/** スキーマ上の 1 キーからトークンを起こす。 */
function addSchemaTokens(key: string, value: unknown, pointer: string, out: Set<string>): void {
  for (const token of TOKEN_SOURCES[key]?.(value, pointer) ?? []) {
    out.add(token);
  }
}

function walk(node: unknown, pointer: string, out: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      walk(item, `${pointer}/${index}`, out);
    });
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    addSchemaTokens(key, value, `${pointer}/${key}`, out);
    walk(value, `${pointer}/${key}`, out);
  }
}

/**
 * ドキュメントを「クライアントが依存できる公開面」の集合に落とす。
 *
 * 集合の差分で破壊的変更を判定するので、整形の違いやキーの並び順では差が出ない。
 */
function surfaceOf(document: unknown): Set<string> {
  const out = new Set<string>();
  if (isRecord(document)) {
    addPathTokens(document['paths'], out);
  }
  walk(document, '', out);
  return out;
}

/**
 * 破壊的変更を列挙する。
 *
 * - 公開面が**消える**のは常に破壊的（経路・操作・応答・フィールド・列挙値）
 * - 公開面が**増える**うち破壊的なのはリクエストの必須項目の追加だけ。
 *   応答側の必須追加や新しいフィールドの追加はクライアントを壊さない
 */
function breakingChanges(base: Set<string>, current: Set<string>): string[] {
  const removed = [...base].filter((token) => !current.has(token) && !token.startsWith('必須 '));
  const addedRequired = [...current].filter(
    (token) => !base.has(token) && token.startsWith('必須 ') && token.includes('/requestBody/'),
  );
  return [...removed.map((token) => `削除: ${token}`), ...addedRequired.map((t) => `必須化: ${t}`)];
}

type ResolvedBase =
  | { readonly kind: 'ok'; readonly ref: string; readonly fellBack: boolean }
  | { readonly kind: 'error'; readonly reason: string; readonly outcome: CommandOutcome };

/**
 * ref をコミット SHA に解決する。
 *
 * `rev-parse --verify <ref>^{commit}` を使わないのは、`runCommand` が `shell: true` で
 * 走り、Windows の cmd.exe では `^` がエスケープ文字として食われるため。
 * 作者の環境でだけ「基準リビジョンを解決できない」と言い続けるゲートになる。
 */
function revision(context: FitnessContext, ref: string): CommandOutcome {
  return context.run(`git rev-list -n 1 ${ref}`, { cwd: context.root });
}

/**
 * 実際に比較に使う基準リビジョンを決める。
 *
 * 基準が HEAD と同じコミットを指していると差分は必ず空になり、この検査は
 * 「破壊的変更なし」を返す。main の上で作業しているときに必ず起きるので、
 * その場合だけ `HEAD~1` に落とす。**黙って落とさず結果に出す**
 * （落ちたこと自体が「比較の幅が狭い」という情報なので）。
 */
function resolveBase(context: FitnessContext): ResolvedBase {
  const ref = context.baseRef;
  if (!SAFE_REF.test(ref)) {
    return {
      kind: 'error',
      reason: `基準リビジョン \`${ref}\` にシェルで解釈が変わる文字が含まれている`,
      outcome: { status: null, stdout: '', stderr: '' },
    };
  }
  const base = revision(context, ref);
  if (base.status !== 0) {
    return {
      kind: 'error',
      reason: `基準リビジョン \`${ref}\` を解決できない。FITNESS_BASE_REF で指定する`,
      outcome: base,
    };
  }

  const head = revision(context, 'HEAD');
  if (head.status !== 0) {
    return { kind: 'error', reason: 'HEAD を解決できない', outcome: head };
  }
  if (base.stdout.trim() !== head.stdout.trim()) {
    return { kind: 'ok', ref, fellBack: false };
  }

  const previous = revision(context, 'HEAD~1');
  if (previous.status !== 0) {
    return {
      kind: 'error',
      reason: `\`${ref}\` が HEAD と同じで、HEAD~1 も無いため比較できない`,
      outcome: previous,
    };
  }
  return { kind: 'ok', ref: 'HEAD~1', fellBack: true };
}

type BaseDocument =
  | { readonly kind: 'ok'; readonly text: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'error'; readonly reason: string; readonly outcome: CommandOutcome };

/**
 * 基準リビジョンの `docs/openapi.json` を取り出す。
 *
 * 「基準に存在しない（= 今回が初回生成）」と「git が引けない」を区別する。
 * 後者を前者として扱うと、git が壊れた瞬間にこの検査が常に緑になる。
 */
function baseDocument(context: FitnessContext, ref: string): BaseDocument {
  const exists = context.run(`git cat-file -e ${ref}:${OPENAPI_SPEC_PATH}`, { cwd: context.root });
  if (exists.status !== 0) {
    return { kind: 'absent' };
  }
  const show = context.run(`git show ${ref}:${OPENAPI_SPEC_PATH}`, { cwd: context.root });
  if (show.status !== 0) {
    return { kind: 'error', reason: '基準リビジョンの OpenAPI を取り出せない', outcome: show };
  }
  return { kind: 'ok', text: show.stdout };
}

/** 基準からこのリビジョンまでのコミットが破壊的変更を宣言しているか。 */
function declaresBreaking(context: FitnessContext, ref: string): CommandOutcome {
  return context.run(`git log --format=%B ${ref}..HEAD`, { cwd: context.root });
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * 適応度関数 ⑯ 公開 API の破壊的変更が宣言されずに混入するのを止める。
 *
 * ⑫ は契約と `docs/openapi.json` の**乖離**しか見ない。契約と一緒にドキュメントを
 * 再生成すれば、フィールドを消しても必須項目を増やしても ⑫ は緑のまま通る。
 * 「破壊的変更かどうかはレビューで差分として見る」という運用に頼っていた部分を、
 * 基準リビジョンとの集合差分で決定論にする。
 *
 * 通す唯一の手段が Conventional Commits での破壊的変更の宣言なので、
 * ゲートを回避しても履歴に必ず痕跡が残る。
 */
/** 基準を狭めた場合だけ、狭めたことを表示に足す。 */
function suffixOf(resolved: { readonly ref: string; readonly fellBack: boolean }): string {
  return resolved.fellBack ? `（${resolved.ref} と比較）` : '';
}

/** 2 つのドキュメントを比べ、破壊的変更が宣言されているかまで見て結論を出す。 */
function compare(
  context: FitnessContext,
  resolved: { readonly ref: string; readonly fellBack: boolean },
  baseText: string,
  currentText: string,
): CheckResult {
  const suffix = suffixOf(resolved);
  const baseDoc = parseJson(baseText);
  const currentDoc = parseJson(currentText);
  if (baseDoc === undefined || currentDoc === undefined) {
    return fail('JSON として読めなかった', [
      `${OPENAPI_SPEC_PATH} か基準リビジョンの内容が壊れている。\`bun run openapi:generate\` を実行する`,
    ]);
  }

  const changes = breakingChanges(surfaceOf(baseDoc), surfaceOf(currentDoc));
  if (changes.length === 0) {
    return pass(`破壊的変更なし${suffix}`);
  }

  const log = declaresBreaking(context, resolved.ref);
  if (log.status !== 0) {
    return fail('コミットログを読めなかった', [
      '破壊的変更が宣言されているか判定できない。',
      ...outputLines(log, MAX_DETAIL_LINES),
    ]);
  }
  if (BREAKING_DECLARATION.test(log.stdout)) {
    return pass(`${changes.length} 件（宣言済み）${suffix}`);
  }

  return fail(`${changes.length} 件が未宣言`, [
    `${resolved.ref} と比べて公開 API が破壊的に変わっている。`,
    'コミットメッセージに `!` か `BREAKING CHANGE:` を付けて意図を宣言する。',
    ...changes.slice(0, MAX_DETAIL_LINES),
  ]);
}

export function checkOpenApiBreaking(context: FitnessContext = defaultContext()): CheckResult {
  const specPath = join(context.root, OPENAPI_SPEC_PATH);
  if (!existsSync(specPath)) {
    return fail('未生成', [`${OPENAPI_SPEC_PATH} が無い。\`bun run openapi:generate\` を実行する`]);
  }

  const resolved = resolveBase(context);
  if (resolved.kind === 'error') {
    return fail('比較できなかった', [
      resolved.reason,
      ...outputLines(resolved.outcome, MAX_DETAIL_LINES),
    ]);
  }

  const base = baseDocument(context, resolved.ref);
  if (base.kind === 'error') {
    return fail('比較できなかった', [base.reason, ...outputLines(base.outcome, MAX_DETAIL_LINES)]);
  }
  if (base.kind === 'absent') {
    return pass(`基準に無し（初回）${suffixOf(resolved)}`);
  }

  return compare(context, resolved, base.text, readFileSync(specPath, 'utf8'));
}
