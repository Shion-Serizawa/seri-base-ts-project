import { describe, expect, it } from 'vitest';

import { createQueryClient, orpc } from './query.ts';

describe('createQueryClient', () => {
  it('クエリのリトライ回数と staleTime を既定値として設定する', () => {
    const options = createQueryClient().getDefaultOptions();
    expect(options.queries?.retry).toBe(1);
    expect(options.queries?.staleTime).toBe(30_000);
  });
});

describe('orpc', () => {
  it('契約の手続きから TanStack Query のオプションを作れる', () => {
    expect(orpc.todo.list.queryOptions().queryKey).toBeDefined();
    expect(orpc.todo.create.mutationOptions().mutationFn).toBeTypeOf('function');
  });
});
