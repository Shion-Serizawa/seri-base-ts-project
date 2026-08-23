import { describe, expect, it } from 'vitest';

import { createQueryClient } from './query-client.ts';

describe('createQueryClient', () => {
  it('クエリのリトライ回数と staleTime を既定値として設定する', () => {
    const options = createQueryClient().getDefaultOptions();
    expect(options.queries?.retry).toBe(1);
    expect(options.queries?.staleTime).toBe(30_000);
  });
});
