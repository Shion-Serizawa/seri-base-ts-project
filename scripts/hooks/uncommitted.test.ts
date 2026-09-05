import { describe, expect, it } from 'vitest';

import type { CommandOutcome } from '../fitness/lib/exec.ts';
import type { Decision } from './uncommitted.ts';
import { decide, parseStopInput } from './uncommitted.ts';

/** ブロックしない判定には理由が無いので、比較しやすいよう空文字列に潰す。 */
function reasonOf(decision: Decision): string {
  return decision.block ? decision.reason : '';
}

const IDLE = { stopHookActive: false };
const CONTINUING = { stopHookActive: true };
const DIRTY = ' M README.md\n?? scripts/hooks/uncommitted.ts\n';

/** `git status --porcelain` が正常終了して出力を返した状態。 */
function porcelain(stdout: string): CommandOutcome {
  return { status: 0, stdout, stderr: '' };
}

describe('parseStopInput', () => {
  it('stop_hook_active: true を読む', () => {
    expect(parseStopInput('{"stop_hook_active":true}')).toStrictEqual(CONTINUING);
  });

  it('stop_hook_active: false を読む', () => {
    expect(parseStopInput('{"stop_hook_active":false}')).toStrictEqual(IDLE);
  });

  it('キーが無ければ継続中ではないとみなす', () => {
    expect(parseStopInput('{"session_id":"abc"}')).toStrictEqual(IDLE);
  });

  it('true 以外の値を継続中とみなさない（"false" 文字列などで素通ししない）', () => {
    expect(parseStopInput('{"stop_hook_active":"false"}')).toStrictEqual(IDLE);
  });

  it('壊れた JSON でも例外にせず、判定する側に倒す', () => {
    expect(parseStopInput('not json')).toStrictEqual(IDLE);
  });

  it('JSON がオブジェクトでなくても例外にしない', () => {
    expect(parseStopInput('[1,2]')).toStrictEqual(IDLE);
    expect(parseStopInput('null')).toStrictEqual(IDLE);
  });
});

describe('decide', () => {
  it('作業ツリーがきれいなら停止させる', () => {
    expect(decide(IDLE, porcelain(''))).toStrictEqual({ block: false });
  });

  it('空白だけの出力も「変更なし」として扱う', () => {
    expect(decide(IDLE, porcelain('\n  \n'))).toStrictEqual({ block: false });
  });

  it('未コミットがあれば停止をブロックする', () => {
    expect(decide(IDLE, porcelain(DIRTY)).block).toBe(true);
  });

  it('未追跡ファイルも未コミットとして扱う（新規ファイルの置き忘れを防ぐ）', () => {
    expect(decide(IDLE, porcelain('?? scripts/hooks/require-commit.ts\n')).block).toBe(true);
  });

  it('件数とファイル名を理由に載せる', () => {
    const decision = decide(IDLE, porcelain(DIRTY));

    expect(reasonOf(decision)).toContain('未コミットの変更が 2 件');
    expect(reasonOf(decision)).toContain('README.md');
  });

  it('多すぎる場合は打ち切って残り件数を示す', () => {
    const many = Array.from({ length: 25 }, (_, index) => ` M file${index}.ts`).join('\n');
    const decision = decide(IDLE, porcelain(many));

    expect(reasonOf(decision)).toContain('他 5 件');
  });

  it('git が失敗したらブロックする（変更なしに倒さない）', () => {
    const decision = decide(IDLE, { status: 128, stdout: '', stderr: 'not a git repository\n' });

    expect(decision.block).toBe(true);
    expect(reasonOf(decision)).toContain('git の状態を確認できませんでした');
  });

  it('git が起動できなかった（status: null）ときもブロックする', () => {
    expect(decide(IDLE, { status: null, stdout: '', stderr: '' }).block).toBe(true);
  });

  it('git が失敗しても継続中なら通す（無限ループを防ぐ方が優先）', () => {
    expect(decide(CONTINUING, { status: null, stdout: '', stderr: '' })).toStrictEqual({
      block: false,
    });
  });

  it('フックで継続中は必ず通す（無限ループを防ぐ）', () => {
    expect(decide(CONTINUING, porcelain(DIRTY))).toStrictEqual({ block: false });
  });
});
