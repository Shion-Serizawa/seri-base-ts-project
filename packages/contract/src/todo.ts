import { z } from 'zod';

/**
 * Todo の識別子。生の string と混同しないよう branded type にしている。
 *
 * 注意: zod の `.brand()` が型を付けるのは**出力側だけ**で、入力（`z.input`）は生の string のまま。
 * つまり API 呼び出しの引数には string を渡せる。brand が守るのは「受け取った id を
 * 他の string と混同すること」であって、呼び出し時の入力ではない。
 * この非対称性は todo.test-d.ts に型テストとして固定してある。
 */
export const todoIdSchema = z.uuid().brand<'TodoId'>();
export type TodoId = z.infer<typeof todoIdSchema>;

// テストからは値（200）を直接書いて検証する。定数を共有すると検証が同語反復になる
const TODO_TITLE_MAX_LENGTH = 200;

export const todoSchema = z.object({
  id: todoIdSchema,
  title: z.string().min(1).max(TODO_TITLE_MAX_LENGTH),
  done: z.boolean(),
  createdAt: z.string(),
});
export type Todo = z.infer<typeof todoSchema>;

export const createTodoInputSchema = z.object({
  title: z.string().min(1).max(TODO_TITLE_MAX_LENGTH),
});
export type CreateTodoInput = z.infer<typeof createTodoInputSchema>;

export const updateTodoInputSchema = z.object({
  done: z.boolean(),
});
export type UpdateTodoInput = z.infer<typeof updateTodoInputSchema>;

export const todoListSchema = z.array(todoSchema);
