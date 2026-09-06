import type { Todo } from '@seri/contract';
import { todoIdSchema } from '@seri/contract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { a11yViolations } from '../../../test/a11y.ts';
import { TodoList } from './todo-list.tsx';

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: todoIdSchema.parse('00000000-0000-4000-8000-000000000000'),
    title: 'サンプル',
    done: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TodoList', () => {
  it('完了件数と割合を表示する', () => {
    render(
      <TodoList
        todos={[makeTodo({ done: true }), makeTodo({ done: false })]}
        onToggle={vi.fn<(todo: Todo) => void>()}
      />,
    );
    expect(screen.getByText('1 / 2 完了（50%）')).toBeInTheDocument();
  });

  it('未完了を先に表示する', () => {
    render(
      <TodoList
        todos={[
          makeTodo({ done: true, title: '完了済み' }),
          makeTodo({ done: false, title: '未完了' }),
        ]}
        onToggle={vi.fn<(todo: Todo) => void>()}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('未完了');
  });

  it('チェックボックス操作で onToggle を呼ぶ', async () => {
    const onToggle = vi.fn<(todo: Todo) => void>();
    const todo = makeTodo({ title: 'クリック対象' });
    render(<TodoList todos={[todo]} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledWith(todo);
  });

  it('0 件のときは 0% を表示する', () => {
    render(<TodoList todos={[]} onToggle={vi.fn<(todo: Todo) => void>()} />);
    expect(screen.getByText('0 / 0 完了（0%）')).toBeInTheDocument();
  });

  it('アクセシビリティ違反が無い', async () => {
    render(
      <TodoList
        todos={[makeTodo({ done: true }), makeTodo({ done: false })]}
        onToggle={vi.fn<(todo: Todo) => void>()}
      />,
    );

    await expect(a11yViolations()).resolves.toStrictEqual([]);
  });
});
