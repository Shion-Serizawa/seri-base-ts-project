import { describe, expect, it } from 'vitest';

import { useSession } from './auth-client.ts';

describe('authClient', () => {
  it('セッション取得用のフックを公開している', () => {
    expect(typeof useSession).toBe('function');
  });
});
