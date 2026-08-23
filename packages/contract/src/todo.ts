import { z } from 'zod';

/** Todo の識別子。生の string と混同しないよう branded type にしている。 */
export const todoIdSchema = z.uuid().brand<'TodoId'>();
export type TodoId = z.infer<typeof todoIdSchema>;

export const TODO_TITLE_MAX_LENGTH = 200;

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
