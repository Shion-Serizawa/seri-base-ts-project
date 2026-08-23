import { describe, expect, it } from 'vitest';

import { authClient, useSession } from './auth-client.ts';

describe('authClient', () => {
  it('セッション取得用のフックを公開している', () => {
    expect(typeof useSession).toBe('function');
  });

  it('サインイン・サインアウトのメソッドを公開している', () => {
    expect(typeof authClient.signIn.email).toBe('function');
    expect(typeof authClient.signOut).toBe('function');
  });
});
