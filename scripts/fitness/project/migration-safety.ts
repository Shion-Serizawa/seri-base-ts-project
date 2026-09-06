import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FitnessContext } from '@seri/base-tooling/fitness/context';
import { defaultContext } from '@seri/base-tooling/fitness/context';
import type { CheckResult } from '@seri/base-tooling/fitness/report';

const MIGRATIONS_PATH = 'packages/db/migrations';
const NAME = 'migration safety';
const EXPECTED = '破壊的な文が無い、または承認済み';
const MAX_DETAIL_LINES = 8;

/**
 * 承認の印。破壊的な文を含むマイグレーションは、この行を同じファイルに書いて
 * 理由を残さないと通らない。
 *
 * ファイル内に置くのは、承認がマイグレーションと同じ寿命を持つべきだから。
 * コミットメッセージに書くと、後からファイルだけを見た人には何も残らない。
 *
 * 空白は水平方向だけを許す。`\s` にすると改行をまたいで次の行の SQL を「理由」と読み、
 * `-- destructive:` と書くだけで何でも通る抜け道になる。
 */
const APPROVAL = /^[^\S\r\n]*--[^\S\r\n]*destructive:[^\S\r\n]*\S/mu;

type Rule = { readonly label: string; readonly pattern: RegExp };

/**
 * D1（SQLite）でデータが戻らなくなる文。
 *
 * ここは「疑わしきは検出」ではなく「戻せないもの」に絞っている。ADR 0002 が
 * 記録しているとおり、誤検出はゲートごと外される原因になる。
 */
const DESTRUCTIVE_RULES: readonly Rule[] = [
  { label: 'テーブルの削除', pattern: /\bDROP\s+TABLE\b/iu },
  { label: '列の削除', pattern: /\bDROP\s+COLUMN\b/iu },
  { label: 'インデックスの削除', pattern: /\bDROP\s+INDEX\b/iu },
  { label: '既存列への NOT NULL 追加', pattern: /\bALTER\s+TABLE\b[\s\S]*?\bNOT\s+NULL\b/iu },
  { label: 'WHERE 無しの DELETE', pattern: /\bDELETE\s+FROM\s+[^;]*?;/iu },
  { label: 'WHERE 無しの UPDATE', pattern: /\bUPDATE\s+[^;]*?\bSET\b[^;]*?;/iu },
];

/** WHERE を持つ DELETE / UPDATE は一括操作ではないので対象外にする。 */
function isBulkStatement(rule: Rule, statement: string): boolean {
  if (!rule.label.startsWith('WHERE 無し')) {
    return true;
  }
  return !/\bWHERE\b/iu.test(statement);
}

/** 行コメントを落とす。承認の印そのものを SQL として読まないため。 */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

function findViolations(sql: string): string[] {
  const body = stripComments(sql);
  const statements = body.split(';').map((statement) => `${statement};`);
  return DESTRUCTIVE_RULES.filter((rule) =>
    statements.some(
      (statement) => rule.pattern.test(statement) && isBulkStatement(rule, statement),
    ),
  ).map((rule) => rule.label);
}

function fail(actual: string, details: readonly string[]): CheckResult {
  return { name: NAME, ok: false, actual, expected: EXPECTED, details };
}

/**
 * 適応度関数 ⑰ 破壊的マイグレーションが黙って通るのを止める。
 *
 * ⑩ はスキーマとマイグレーションの**乖離**しか見ないので、列を消すマイグレーションを
 * 正しく生成しさえすれば緑で通る。D1 には巻き戻しが無く、失ったデータは戻らない。
 * 「型でもテストでも守れない性質のもの」（⑨ シークレット・⑩ 乖離と同じ枠）として直接見る。
 *
 * 承認は SQL ファイル内の `-- destructive: <理由>` で行う。通す手段が
 * 「ファイルに理由を書き残すこと」しか無いので、回避しても記録が残る。
 */
export function checkMigrationSafety(context: FitnessContext = defaultContext()): CheckResult {
  const directory = join(context.root, MIGRATIONS_PATH);
  if (!existsSync(directory)) {
    return fail('マイグレーションが無い', [
      `${MIGRATIONS_PATH} が見つからない。消すかリネームすると、この検査は何も見なくなる。`,
      '`bun run --filter @seri/db db:generate` で生成する。',
    ]);
  }

  const files = readdirSync(directory).filter((entry) => entry.endsWith('.sql'));
  if (files.length === 0) {
    return fail('SQL が 1 件も無い', [
      `${MIGRATIONS_PATH} に .sql が無い。計測できていないので緑にはしない。`,
    ]);
  }

  const unapproved = files
    .map((file) => ({ file, sql: readFileSync(join(directory, file), 'utf8') }))
    .filter(({ sql }) => !APPROVAL.test(sql))
    .flatMap(({ file, sql }) => findViolations(sql).map((label) => `${file}: ${label}`));

  if (unapproved.length > 0) {
    return fail(`${unapproved.length} 件が未承認`, [
      '破壊的な文を含むマイグレーションには、同じファイルに承認を書き残す。',
      '例: `-- destructive: done 列は使われていないため削除する（ADR 00xx）`',
      ...unapproved.slice(0, MAX_DETAIL_LINES),
    ]);
  }

  return { name: NAME, ok: true, actual: `${files.length} 件を検査`, expected: EXPECTED };
}
