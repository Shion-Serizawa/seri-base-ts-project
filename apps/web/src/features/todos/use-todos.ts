import type { CreateTodoInput, Todo, TodoId } from '@seri/contract';
import { todoListSchema, todoSchema } from '@seri/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api-client.ts';

const TODOS_KEY = ['todos'] as const;

export function useTodos(): UseQueryResult<Todo[]> {
  return useQuery({
    queryKey: TODOS_KEY,
    queryFn: async (): Promise<Todo[]> => {
      const res = await api.api.todos.$get();
      return todoListSchema.parse(await res.json());
    },
  });
}

export function useCreateTodo(): UseMutationResult<Todo, Error, CreateTodoInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTodoInput): Promise<Todo> => {
      const res = await api.api.todos.$post({ json: input });
      if (!res.ok) {
        throw new Error('failed to create todo');
      }
      return todoSchema.parse(await res.json());
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: TODOS_KEY });
    },
  });
}

export function useToggleTodo(): UseMutationResult<Todo, Error, { id: TodoId; done: boolean }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: TodoId; done: boolean }): Promise<Todo> => {
      const res = await api.api.todos[':id'].$patch({ param: { id }, json: { done } });
      if (!res.ok) {
        throw new Error('failed to update todo');
      }
      return todoSchema.parse(await res.json());
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: TODOS_KEY });
    },
  });
}
