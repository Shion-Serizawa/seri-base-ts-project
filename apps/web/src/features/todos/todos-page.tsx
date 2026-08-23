import type { Todo } from '@seri/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSX, SubmitEvent } from 'react';
import { useState } from 'react';

import { orpc } from '../../lib/query.ts';
import { TodoList } from './todo-list.tsx';

/**
 * 一覧の再取得。oRPC の query utils がキーを生成するので、キーを手で組まない。
 *
 * カスタムフックで useQuery / useMutation を包み直していないのは、
 * 戻り値の型が oRPC と TanStack Query の推論に依存しており、
 * 手書きの型注釈を付けると型を狭めて壊れるため。
 */
function useInvalidateTodos(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: orpc.todo.list.queryKey() });
  };
}

export function TodosPage(): JSX.Element {
  const [title, setTitle] = useState('');
  const invalidateTodos = useInvalidateTodos();
  const todos = useQuery(orpc.todo.list.queryOptions());
  const createTodo = useMutation(orpc.todo.create.mutationOptions({ onSuccess: invalidateTodos }));
  const toggleTodo = useMutation(orpc.todo.setDone.mutationOptions({ onSuccess: invalidateTodos }));

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (title.trim().length === 0) {
      return;
    }
    createTodo.mutate({ title });
    setTitle('');
  };

  const handleToggle = (todo: Todo): void => {
    toggleTodo.mutate({ id: todo.id, done: !todo.done });
  };

  return (
    <main>
      <form onSubmit={handleSubmit}>
        <input
          aria-label="やること"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <button type="submit">追加</button>
      </form>
      {todos.isPending ? <p>読み込み中…</p> : null}
      {todos.isError ? <p role="alert">読み込みに失敗しました</p> : null}
      {todos.data === undefined ? null : <TodoList todos={todos.data} onToggle={handleToggle} />}
    </main>
  );
}
