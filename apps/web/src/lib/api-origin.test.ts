import { describe, expect, it, vi } from 'vitest';

import { apiOrigin, authUrl, rpcUrl } from './api-origin.ts';

describe('apiOrigin', () => {
  it('VITE_API_URL が未設定なら同一オリジンを使う', () => {
    expect(apiOrigin()).toBe(globalThis.location.origin);
  });

  it('VITE_API_URL が設定されていればそれを使う', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    expect(apiOrigin()).toBe('https://api.example.test');
  });
});

describe('エンドポイント URL', () => {
  it('rpcUrl はオリジンに /api/rpc を付ける', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    expect(rpcUrl()).toBe('https://api.example.test/api/rpc');
  });

  it('authUrl はオリジンに /api/auth を付ける', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    expect(authUrl()).toBe('https://api.example.test/api/auth');
  });
});
