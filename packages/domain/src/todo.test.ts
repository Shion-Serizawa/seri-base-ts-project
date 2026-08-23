import type { Todo } from '@seri/contract';
import { todoIdSchema } from '@seri/contract';
import { describe, expect, it } from 'vitest';

import { normalizeTitle, sortForDisplay, summarize, toggleDone } from './todo.ts';

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: todoIdSchema.parse('00000000-0000-4000-8000-000000000000'),
    title: 'sample',
    done: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeTitle', () => {
  it('前後の空白を取り除く', () => {
    expect(normalizeTitle('  買い物  ')).toBe('買い物');
  });

  it('連続する空白を1つに畳み込む', () => {
    expect(normalizeTitle('牛乳\t\tと   パン')).toBe('牛乳 と パン');
  });

  it('空白のみの入力は空文字になる', () => {
    expect(normalizeTitle('   ')).toBe('');
  });
});

describe('toggleDone', () => {
  it('未完了を完了にする', () => {
    expect(toggleDone(makeTodo({ done: false })).done).toBe(true);
  });

  it('完了を未完了にする', () => {
    expect(toggleDone(makeTodo({ done: true })).done).toBe(false);
  });

  it('元のオブジェクトを変更しない', () => {
    const original = makeTodo({ done: false });
    toggleDone(original);
    expect(original.done).toBe(false);
  });
});

describe('summarize', () => {
  it('空配列では completionRate が 0 になる', () => {
    expect(summarize([])).toStrictEqual({
      total: 0,
      done: 0,
      remaining: 0,
      completionRate: 0,
    });
  });

  it('完了数と残数を数える', () => {
    const todos = [makeTodo({ done: true }), makeTodo({ done: false }), makeTodo({ done: false })];
    expect(summarize(todos)).toStrictEqual({
      total: 3,
      done: 1,
      remaining: 2,
      completionRate: 1 / 3,
    });
  });

  it('全件完了で completionRate が 1 になる', () => {
    expect(summarize([makeTodo({ done: true })]).completionRate).toBe(1);
  });
});

describe('sortForDisplay', () => {
  it('未完了を完了より前に並べる', () => {
    const done = makeTodo({ done: true, title: 'done' });
    const open = makeTodo({ done: false, title: 'open' });
    expect(sortForDisplay([done, open]).map((todo) => todo.title)).toStrictEqual(['open', 'done']);
  });

  it('同じ完了状態では新しい順に並べる', () => {
    const older = makeTodo({ title: 'older', createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeTodo({ title: 'newer', createdAt: '2026-02-01T00:00:00.000Z' });
    expect(sortForDisplay([older, newer]).map((todo) => todo.title)).toStrictEqual([
      'newer',
      'older',
    ]);
  });

  it('完了済みどうしでも新しい順に並べる', () => {
    const older = makeTodo({ done: true, title: 'older', createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeTodo({ done: true, title: 'newer', createdAt: '2026-03-01T00:00:00.000Z' });
    expect(sortForDisplay([older, newer]).map((todo) => todo.title)).toStrictEqual([
      'newer',
      'older',
    ]);
  });

  it('元の配列を変更しない', () => {
    const todos = [makeTodo({ done: true, title: 'a' }), makeTodo({ done: false, title: 'b' })];
    sortForDisplay(todos);
    expect(todos.map((todo) => todo.title)).toStrictEqual(['a', 'b']);
  });
});
