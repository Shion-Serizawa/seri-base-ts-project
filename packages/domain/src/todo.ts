import type { Todo } from '@seri/contract';

/** 表示・保存前にタイトルを正規化する（前後空白の除去と連続空白の畳み込み）。 */
export function normalizeTitle(raw: string): string {
  return raw.trim().replaceAll(/\s+/gu, ' ');
}

/** 完了状態を反転した新しい Todo を返す（元の値は変更しない）。 */
export function toggleDone(todo: Todo): Todo {
  return { ...todo, done: !todo.done };
}

export type TodoStats = {
  readonly total: number;
  readonly done: number;
  readonly remaining: number;
  /** 0 件のときは 0。0〜1 の範囲。 */
  readonly completionRate: number;
};

export function summarize(todos: readonly Todo[]): TodoStats {
  const total = todos.length;
  const done = todos.filter((todo) => todo.done).length;
  return {
    total,
    done,
    remaining: total - done,
    completionRate: total === 0 ? 0 : done / total,
  };
}

/** 未完了を先に、その中では新しい順に並べた新しい配列を返す。 */
export function sortForDisplay(todos: readonly Todo[]): Todo[] {
  return todos.toSorted((a, b) => {
    if (a.done !== b.done) {
      return a.done ? 1 : -1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}
