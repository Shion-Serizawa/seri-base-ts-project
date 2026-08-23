import { describe, expect, it } from 'vitest';

import {
  createTodoInputSchema,
  TODO_TITLE_MAX_LENGTH,
  todoIdSchema,
  todoSchema,
  updateTodoInputSchema,
} from './todo.ts';

const validId = '00000000-0000-4000-8000-000000000000';

describe('todoIdSchema', () => {
  it('uuid を受け付ける', () => {
    expect(todoIdSchema.parse(validId)).toBe(validId);
  });

  it('uuid でない文字列を拒否する', () => {
    expect(todoIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('todoSchema', () => {
  it('正しい形の値を受け付ける', () => {
    const value = { id: validId, title: 'やること', done: false, createdAt: '2026-01-01' };
    expect(todoSchema.parse(value)).toStrictEqual(value);
  });

  it('title が空文字なら拒否する', () => {
    expect(
      todoSchema.safeParse({ id: validId, title: '', done: false, createdAt: '2026-01-01' })
        .success,
    ).toBe(false);
  });

  it('未知のキーを取り除く', () => {
    const parsed = todoSchema.parse({
      id: validId,
      title: 'やること',
      done: true,
      createdAt: '2026-01-01',
      extra: 'ignored',
    });
    expect(parsed).not.toHaveProperty('extra');
  });
});

describe('createTodoInputSchema', () => {
  it('上限ちょうどの長さを受け付ける', () => {
    const title = 'あ'.repeat(TODO_TITLE_MAX_LENGTH);
    expect(createTodoInputSchema.parse({ title }).title).toHaveLength(TODO_TITLE_MAX_LENGTH);
  });

  it('上限を 1 文字超えると拒否する', () => {
    const title = 'あ'.repeat(TODO_TITLE_MAX_LENGTH + 1);
    expect(createTodoInputSchema.safeParse({ title }).success).toBe(false);
  });

  it('title が無いと拒否する', () => {
    expect(createTodoInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('updateTodoInputSchema', () => {
  it('boolean 以外の done を拒否する', () => {
    expect(updateTodoInputSchema.safeParse({ done: 'yes' }).success).toBe(false);
  });

  it('boolean の done を受け付ける', () => {
    expect(updateTodoInputSchema.parse({ done: true }).done).toBe(true);
  });
});
