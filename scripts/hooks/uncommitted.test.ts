import { describe, expect, it } from 'vitest';

import type { Decision } from './uncommitted.ts';
import { decide, parseStopInput } from './uncommitted.ts';

/** ブロックしない判定には理由が無いので、比較しやすいよう空文字列に潰す。 */
function reasonOf(decision: Decision): string {
  return decision.block ? decision.reason : '';
}

const IDLE = { stopHookActive: false };
const CONTINUING = { stopHookActive: true };
const DIRTY = ' M README.md\n?? scripts/hooks/uncommitted.ts\n';

describe('parseStopInput', () => {
  it('stop_hook_active: true を読む', () => {
    expect(parseStopInput('{"stop_hook_active":true}')).toEqual(CONTINUING);
  });

  it('stop_hook_active: false を読む', () => {
    expect(parseStopInput('{"stop_hook_active":false}')).toEqual(IDLE);
  });

  it('キーが無ければ継続中ではないとみなす', () => {
    expect(parseStopInput('{"session_id":"abc"}')).toEqual(IDLE);
  });

  it('true 以外の値を継続中とみなさない（"false" 文字列などで素通ししない）', () => {
    expect(parseStopInput('{"stop_hook_active":"false"}')).toEqual(IDLE);
  });

  it('壊れた JSON でも例外にせず、判定する側に倒す', () => {
    expect(parseStopInput('not json')).toEqual(IDLE);
  });

  it('JSON がオブジェクトでなくても例外にしない', () => {
    expect(parseStopInput('[1,2]')).toEqual(IDLE);
    expect(parseStopInput('null')).toEqual(IDLE);
  });
});

describe('decide', () => {
  it('作業ツリーがきれいなら停止させる', () => {
    expect(decide(IDLE, '')).toEqual({ block: false });
  });

  it('空白だけの出力も「変更なし」として扱う', () => {
    expect(decide(IDLE, '\n  \n')).toEqual({ block: false });
  });

  it('未コミットがあれば停止をブロックする', () => {
    expect(decide(IDLE, DIRTY).block).toBe(true);
  });

  it('未追跡ファイルも未コミットとして扱う（新規ファイルの置き忘れを防ぐ）', () => {
    expect(decide(IDLE, '?? scripts/hooks/require-commit.ts\n').block).toBe(true);
  });

  it('件数とファイル名を理由に載せる', () => {
    const decision = decide(IDLE, DIRTY);

    expect(reasonOf(decision)).toContain('未コミットの変更が 2 件');
    expect(reasonOf(decision)).toContain('README.md');
  });

  it('多すぎる場合は打ち切って残り件数を示す', () => {
    const many = Array.from({ length: 25 }, (_, index) => ` M file${index}.ts`).join('\n');
    const decision = decide(IDLE, many);

    expect(reasonOf(decision)).toContain('他 5 件');
  });

  it('フックで継続中は必ず通す（無限ループを防ぐ）', () => {
    expect(decide(CONTINUING, DIRTY)).toEqual({ block: false });
  });
});
