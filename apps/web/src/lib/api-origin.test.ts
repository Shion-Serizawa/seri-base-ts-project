import { AUTH_ENDPOINT, RPC_ENDPOINT } from '@seri/contract/endpoints';
import { describe, expect, it, vi } from 'vitest';

import { authUrl, rpcUrl } from './api-origin.ts';

describe('エンドポイント URL', () => {
  it('VITE_API_URL が未設定なら同一オリジンを使う', () => {
    expect(rpcUrl()).toBe(`${globalThis.location.origin}${RPC_ENDPOINT}`);
  });

  it('VITE_API_URL が設定されていればそれを使う', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    expect(rpcUrl()).toBe(`https://api.example.test${RPC_ENDPOINT}`);
  });

  it('authUrl は認証用のパスを使う', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test');
    expect(authUrl()).toBe(`https://api.example.test${AUTH_ENDPOINT}`);
  });

  it('rpcUrl と authUrl は別のパスを指す', () => {
    expect(rpcUrl()).not.toBe(authUrl());
  });
});
