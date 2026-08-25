import { describe, expect, it } from 'vitest';

import {
  API_BASE_PATH,
  AUTH_ENDPOINT,
  AUTH_ROUTE,
  HEALTH_ROUTE,
  RPC_ENDPOINT,
  RPC_ROUTE,
} from './endpoints.ts';

/**
 * 公開 URL はサーバのマウント先とクライアントの接続先の合意そのものなので、
 * 変更が意図的であることをここで確認できるようにする（値を直接書いて固定する）。
 */
describe('エンドポイント', () => {
  it('公開しているパスが変わっていない', () => {
    expect({
      rpc: RPC_ENDPOINT,
      auth: AUTH_ENDPOINT,
      health: `${API_BASE_PATH}${HEALTH_ROUTE}`,
    }).toStrictEqual({
      rpc: '/api/rpc',
      auth: '/api/auth',
      health: '/api/health',
    });
  });

  it('絶対パスはベースと相対パスの連結になっている', () => {
    expect(RPC_ENDPOINT).toBe(`${API_BASE_PATH}${RPC_ROUTE}`);
    expect(AUTH_ENDPOINT).toBe(`${API_BASE_PATH}${AUTH_ROUTE}`);
  });

  it('相対パスは / で始まる（Hono の basePath 配下に置くため）', () => {
    expect([RPC_ROUTE, AUTH_ROUTE, HEALTH_ROUTE].every((route) => route.startsWith('/'))).toBe(
      true,
    );
  });
});
