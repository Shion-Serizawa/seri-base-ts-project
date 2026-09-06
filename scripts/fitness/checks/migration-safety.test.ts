import { describe, expect, it } from 'vitest';

import { contextOf, makeTempRepo } from '../../test/temp-repo.ts';
import { checkMigrationSafety } from './migration-safety.ts';

const MIGRATION = 'packages/db/migrations/0000_init.sql';

function repoWith(sql: string): string {
  return makeTempRepo({ [MIGRATION]: sql });
}

describe('checkMigrationSafety', () => {
  it('テーブル作成だけなら PASS', () => {
    const result = checkMigrationSafety(
      contextOf(repoWith('CREATE TABLE `todo` (\n `id` text NOT NULL\n);')),
    );

    expect(result.ok).toBe(true);
    expect(result.actual).toBe('1 件を検査');
  });

  it('実リポジトリと同じ drizzle の出力形式を誤検出しない', () => {
    const sql = [
      'CREATE TABLE `session` (',
      '\t`id` text PRIMARY KEY NOT NULL,',
      '\t`user_id` text NOT NULL,',
      '\tFOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade',
      ');',
      '--> statement-breakpoint',
      'CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);',
    ].join('\n');

    expect(checkMigrationSafety(contextOf(repoWith(sql))).ok).toBe(true);
  });

  it('DROP TABLE を未承認なら FAIL', () => {
    const result = checkMigrationSafety(contextOf(repoWith('DROP TABLE `todo`;')));

    expect(result.ok).toBe(false);
    expect(result.details?.some((line) => line.includes('テーブルの削除'))).toBe(true);
  });

  it('DROP COLUMN を未承認なら FAIL', () => {
    const result = checkMigrationSafety(
      contextOf(repoWith('ALTER TABLE `todo` DROP COLUMN `done`;')),
    );

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('1 件が未承認');
  });

  it('既存列への NOT NULL 追加を検出する', () => {
    const result = checkMigrationSafety(
      contextOf(repoWith('ALTER TABLE `todo` ADD `owner` text NOT NULL;')),
    );

    expect(result.ok).toBe(false);
    expect(result.details?.some((line) => line.includes('NOT NULL'))).toBe(true);
  });

  it('WHERE 無しの DELETE を検出する', () => {
    expect(checkMigrationSafety(contextOf(repoWith('DELETE FROM `todo`;'))).ok).toBe(false);
  });

  it('WHERE 付きの DELETE は対象外', () => {
    expect(
      checkMigrationSafety(contextOf(repoWith('DELETE FROM `todo` WHERE `done` = 1;'))).ok,
    ).toBe(true);
  });

  it('WHERE 無しの UPDATE を検出する', () => {
    expect(checkMigrationSafety(contextOf(repoWith('UPDATE `todo` SET `done` = 0;'))).ok).toBe(
      false,
    );
  });

  it('WHERE 付きの UPDATE は対象外', () => {
    expect(
      checkMigrationSafety(contextOf(repoWith("UPDATE `todo` SET `done` = 0 WHERE `id` = 'a';")))
        .ok,
    ).toBe(true);
  });

  it('承認コメントがあれば通す', () => {
    const sql =
      '-- destructive: done 列は未使用のため削除する\nALTER TABLE `todo` DROP COLUMN `done`;';

    expect(checkMigrationSafety(contextOf(repoWith(sql))).ok).toBe(true);
  });

  it('理由の無い承認コメントは承認として扱わない', () => {
    const sql = '-- destructive:\nDROP TABLE `todo`;';

    expect(checkMigrationSafety(contextOf(repoWith(sql))).ok).toBe(false);
  });

  it('マイグレーションディレクトリが無ければ FAIL にして復旧手順を示す', () => {
    const result = checkMigrationSafety(contextOf(makeTempRepo({})));

    expect(result.ok).toBe(false);
    expect(result.details?.some((line) => line.includes('db:generate'))).toBe(true);
  });

  it('SQL が 1 件も無ければ FAIL（計測不能を緑にしない）', () => {
    const result = checkMigrationSafety(
      contextOf(makeTempRepo({ 'packages/db/migrations/meta/_journal.json': '{}' })),
    );

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('SQL が 1 件も無い');
  });

  it('複数ファイルのうち違反しているものだけを挙げる', () => {
    const root = makeTempRepo({
      'packages/db/migrations/0000_init.sql': 'CREATE TABLE `todo` (`id` text);',
      'packages/db/migrations/0001_drop.sql': 'DROP TABLE `todo`;',
    });

    const result = checkMigrationSafety(contextOf(root));

    expect(result.details?.filter((line) => line.includes('0001_drop.sql')).length).toBe(1);
    expect(result.details?.some((line) => line.includes('0000_init.sql'))).toBe(false);
  });
});
