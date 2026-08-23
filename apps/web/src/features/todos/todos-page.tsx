import type { Todo } from '@seri/contract';
import type { JSX, SubmitEvent } from 'react';
import { useState } from 'react';

import { TodoList } from './todo-list.tsx';
import { useCreateTodo, useToggleTodo, useTodos } from './use-todos.ts';

export function TodosPage(): JSX.Element {
  const [title, setTitle] = useState('');
  const todos = useTodos();
  const createTodo = useCreateTodo();
  const toggleTodo = useToggleTodo();

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
