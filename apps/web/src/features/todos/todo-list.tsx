import type { Todo } from '@seri/contract';
import { sortForDisplay, summarize } from '@seri/domain';
import type { JSX } from 'react';

type Props = {
  readonly todos: readonly Todo[];
  readonly onToggle: (todo: Todo) => void;
};

export function TodoList({ todos, onToggle }: Props): JSX.Element {
  const stats = summarize(todos);

  return (
    <section>
      <p>
        {stats.done} / {stats.total} 完了（{Math.round(stats.completionRate * 100)}%）
      </p>
      <ul>
        {sortForDisplay(todos).map((todo) => (
          <li key={todo.id}>
            <label>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => {
                  onToggle(todo);
                }}
              />
              {todo.title}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
