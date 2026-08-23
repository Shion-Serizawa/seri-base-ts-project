import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { apiContract } from '@seri/contract';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { app, RPC_PREFIX } from '../app.ts';

/**
 * 実際の oRPC クライアントから Hono 経由で叩くことで、
 * 契約・シリアライズ・ルーティング・D1 アクセスまで通しで検証する。
 */
const link = new RPCLink({
  url: `http://localhost${RPC_PREFIX}`,
  fetch: async (request) => await app.fetch(request, env),
});
const client: ContractRouterClient<typeof apiContract> = createORPCClient(link);

const validId = '00000000-0000-4000-8000-000000000000';

/**
 * 失敗した呼び出しのエラーコードを取り出す（テスト本体に条件分岐を持ち込まないため）。
 * ORPCError の `code` は型パラメータ次第で any になるため、instanceof ではなく形で絞る。
 */
function codeOf(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) {
    return undefined;
  }
  const { code } = cause;
  return typeof code === 'string' ? code : undefined;
}

beforeEach(async () => {
  await env.DB.prepare('delete from todos').run();
});

describe('todo.list', () => {
  it('最初は空配列を返す', async () => {
    await expect(client.todo.list()).resolves.toStrictEqual([]);
  });

  it('作成した Todo を含む', async () => {
    await client.todo.create({ title: 'タスクA' });
    const todos = await client.todo.list();
    expect(todos.map((todo) => todo.title)).toStrictEqual(['タスクA']);
  });
});

describe('todo.create', () => {
  it('タイトルを正規化して作成する', async () => {
    const created = await client.todo.create({ title: '  牛乳を   買う ' });
    expect(created.title).toBe('牛乳を 買う');
    expect(created.done).toBe(false);
  });

  it('空白のみのタイトルは BLANK_TITLE になる', async () => {
    const error = await client.todo.create({ title: '   ' }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('BLANK_TITLE');
  });

  it('空文字は契約のバリデーションで弾かれる', async () => {
    const error = await client.todo.create({ title: '' }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('BAD_REQUEST');
  });

  it('上限を超えるタイトルは契約のバリデーションで弾かれる', async () => {
    const error = await client.todo
      .create({ title: 'あ'.repeat(201) })
      .catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('BAD_REQUEST');
  });
});

describe('todo.setDone', () => {
  it('完了状態を更新する', async () => {
    const created = await client.todo.create({ title: 'タスクB' });
    const updated = await client.todo.setDone({ id: created.id, done: true });
    expect(updated.done).toBe(true);
  });

  it('存在しない id は NOT_FOUND になる', async () => {
    const error = await client.todo
      .setDone({ id: validId, done: true })
      .catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('NOT_FOUND');
  });
});

describe('todo.remove', () => {
  it('削除した id を返す', async () => {
    const created = await client.todo.create({ title: 'タスクC' });
    await expect(client.todo.remove({ id: created.id })).resolves.toStrictEqual({
      id: created.id,
    });
  });

  it('存在しない id は NOT_FOUND になる', async () => {
    const error = await client.todo.remove({ id: validId }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('NOT_FOUND');
  });
});

describe('状態遷移', () => {
  it('複数件作成すると全件が一覧に含まれる', async () => {
    await client.todo.create({ title: 'A' });
    await client.todo.create({ title: 'B' });
    await client.todo.create({ title: 'C' });

    const titles = (await client.todo.list()).map((todo) => todo.title);
    expect(titles.toSorted()).toStrictEqual(['A', 'B', 'C']);
  });

  it('完了にした後で未完了に戻せる', async () => {
    const created = await client.todo.create({ title: '往復' });

    await client.todo.setDone({ id: created.id, done: true });
    const reverted = await client.todo.setDone({ id: created.id, done: false });

    expect(reverted.done).toBe(false);
  });

  it('更新は一覧にも反映される', async () => {
    const created = await client.todo.create({ title: '反映確認' });
    await client.todo.setDone({ id: created.id, done: true });

    const listed = await client.todo.list();
    expect(listed.map((todo) => todo.done)).toStrictEqual([true]);
  });

  it('削除すると一覧から消える', async () => {
    const kept = await client.todo.create({ title: '残す' });
    const removed = await client.todo.create({ title: '消す' });

    await client.todo.remove({ id: removed.id });

    const titles = (await client.todo.list()).map((todo) => todo.title);
    expect(titles).toStrictEqual([kept.title]);
  });

  it('同じ id を二度削除すると二度目は NOT_FOUND になる', async () => {
    const created = await client.todo.create({ title: '二度消す' });
    await client.todo.remove({ id: created.id });

    const error = await client.todo.remove({ id: created.id }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('NOT_FOUND');
  });
});

describe('存在しない手続き', () => {
  it('404 を返す', async () => {
    const res = await app.request('/api/rpc/todo/unknown', { method: 'POST' }, env);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/health', () => {
  it('ok を返す', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toStrictEqual({ status: 'ok' });
  });
});
