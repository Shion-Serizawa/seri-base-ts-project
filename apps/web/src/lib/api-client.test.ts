import { describe, expect, it, vi } from 'vitest';

import { apiClient } from './api-client.ts';

/**
 * 契約からクライアントが正しく生成されているかを見る。
 * 手続きを増やしたのにクライアント側に生えない、という配線ミスをここで検出する。
 * 実際の通信内容は apps/api の統合テストが検証する。
 */
describe('apiClient', () => {
  it('契約の手続きがすべて呼び出し可能な形で生えている', () => {
    expect(typeof apiClient.todo.list).toBe('function');
    expect(typeof apiClient.todo.create).toBe('function');
    expect(typeof apiClient.todo.setDone).toBe('function');
    expect(typeof apiClient.todo.remove).toBe('function');
  });

  it('リクエストに credentials: include を付ける（認証 Cookie が送られる）', async () => {
    const fetchSpy = vi
      .fn<(request: Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', fetchSpy);

    // レスポンスは契約を満たさないので失敗するが、ここでは送信時の設定だけを見る
    await apiClient.todo.list().catch(() => null);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });
});
