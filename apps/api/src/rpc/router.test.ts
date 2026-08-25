import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { apiContract } from '@seri/contract';
import { API_BASE_PATH, AUTH_ENDPOINT, HEALTH_ROUTE, RPC_ENDPOINT } from '@seri/contract/endpoints';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { app } from '../app.ts';

type Client = ContractRouterClient<typeof apiContract>;

/**
 * 実際の oRPC クライアントから Hono 経由で叩くことで、
 * 契約・シリアライズ・ルーティング・認証・D1 アクセスまで通しで検証する。
 */
function makeClient(cookie?: string): Client {
  const link = new RPCLink({
    url: `http://localhost${RPC_ENDPOINT}`,
    headers: cookie === undefined ? {} : { cookie },
    fetch: async (request) => await app.fetch(request, env),
  });
  return createORPCClient(link);
}

async function signUp(email: string): Promise<string> {
  const res = await app.request(
    `${AUTH_ENDPOINT}/sign-up/email`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'テスト', email, password: 'correct-horse-battery-staple' }),
    },
    env,
  );
  const cookie = res.headers.get('set-cookie');
  if (cookie === null) {
    throw new Error(`サインアップに失敗しました: ${res.status}`);
  }
  return cookie;
}

/** 失敗した呼び出しのエラーコードを取り出す（テスト本体に条件分岐を持ち込まないため）。 */
function codeOf(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) {
    return undefined;
  }
  const { code } = cause;
  return typeof code === 'string' ? code : undefined;
}

const validId = '00000000-0000-4000-8000-000000000000';
const anonymous = makeClient();
let alice: Client;
let bob: Client;

beforeEach(async () => {
  await env.DB.prepare('delete from todos').run();
  await env.DB.prepare('delete from session').run();
  await env.DB.prepare('delete from account').run();
  await env.DB.prepare('delete from user').run();
  alice = makeClient(await signUp('alice@example.test'));
  bob = makeClient(await signUp('bob@example.test'));
});

describe('未認証のアクセス', () => {
  it('list は UNAUTHORIZED', async () => {
    expect(codeOf(await anonymous.todo.list().catch((cause: unknown) => cause))).toBe(
      'UNAUTHORIZED',
    );
  });

  it('create は UNAUTHORIZED', async () => {
    const error = await anonymous.todo.create({ title: 'x' }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('UNAUTHORIZED');
  });

  it('setDone は UNAUTHORIZED', async () => {
    const error = await anonymous.todo
      .setDone({ id: validId, done: true })
      .catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('UNAUTHORIZED');
  });

  it('remove は UNAUTHORIZED', async () => {
    const error = await anonymous.todo.remove({ id: validId }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('UNAUTHORIZED');
  });
});

describe('todo.list', () => {
  it('最初は空配列を返す', async () => {
    await expect(alice.todo.list()).resolves.toStrictEqual([]);
  });

  it('作成した Todo を含む', async () => {
    await alice.todo.create({ title: 'タスクA' });
    const todos = await alice.todo.list();
    expect(todos.map((todo) => todo.title)).toStrictEqual(['タスクA']);
  });
});

describe('todo.create', () => {
  it('タイトルを正規化して作成する', async () => {
    const created = await alice.todo.create({ title: '  牛乳を   買う ' });
    expect(created.title).toBe('牛乳を 買う');
    expect(created.done).toBe(false);
  });

  it('レスポンスに userId は含まれない', async () => {
    const created = await alice.todo.create({ title: 'タスク' });
    expect(created).not.toHaveProperty('userId');
  });

  it('空白のみのタイトルは BLANK_TITLE になる', async () => {
    const error = await alice.todo.create({ title: '   ' }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('BLANK_TITLE');
  });

  it('空文字は契約のバリデーションで弾かれる', async () => {
    const error = await alice.todo.create({ title: '' }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('BAD_REQUEST');
  });

  it('上限を超えるタイトルは契約のバリデーションで弾かれる', async () => {
    const error = await alice.todo
      .create({ title: 'あ'.repeat(201) })
      .catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('BAD_REQUEST');
  });
});

describe('todo.setDone', () => {
  it('完了状態を更新する', async () => {
    const created = await alice.todo.create({ title: 'タスクB' });
    const updated = await alice.todo.setDone({ id: created.id, done: true });
    expect(updated.done).toBe(true);
  });

  it('存在しない id は NOT_FOUND になる', async () => {
    const error = await alice.todo
      .setDone({ id: validId, done: true })
      .catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('NOT_FOUND');
  });
});

describe('todo.remove', () => {
  it('削除した id を返す', async () => {
    const created = await alice.todo.create({ title: 'タスクC' });
    await expect(alice.todo.remove({ id: created.id })).resolves.toStrictEqual({
      id: created.id,
    });
  });

  it('存在しない id は NOT_FOUND になる', async () => {
    const error = await alice.todo.remove({ id: validId }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('NOT_FOUND');
  });
});

describe('他人の Todo に触れない（認可）', () => {
  it('他人が作った Todo は一覧に出ない', async () => {
    await alice.todo.create({ title: 'アリスのタスク' });
    await expect(bob.todo.list()).resolves.toStrictEqual([]);
  });

  it('他人の Todo は更新できない（存在を漏らさず NOT_FOUND）', async () => {
    const created = await alice.todo.create({ title: 'アリスのタスク' });
    const error = await bob.todo
      .setDone({ id: created.id, done: true })
      .catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('NOT_FOUND');
  });

  it('他人の Todo は削除できない', async () => {
    const created = await alice.todo.create({ title: 'アリスのタスク' });
    const error = await bob.todo.remove({ id: created.id }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('NOT_FOUND');
  });

  it('他人が削除を試みても元の Todo は残る', async () => {
    const created = await alice.todo.create({ title: 'アリスのタスク' });
    await bob.todo.remove({ id: created.id }).catch(() => null);
    const remaining = await alice.todo.list();
    expect(remaining.map((todo) => todo.id)).toStrictEqual([created.id]);
  });
});

describe('状態遷移', () => {
  it('複数件作成すると全件が一覧に含まれる', async () => {
    await alice.todo.create({ title: 'A' });
    await alice.todo.create({ title: 'B' });
    await alice.todo.create({ title: 'C' });

    const titles = (await alice.todo.list()).map((todo) => todo.title);
    expect(titles.toSorted()).toStrictEqual(['A', 'B', 'C']);
  });

  it('完了にした後で未完了に戻せる', async () => {
    const created = await alice.todo.create({ title: '往復' });

    await alice.todo.setDone({ id: created.id, done: true });
    const reverted = await alice.todo.setDone({ id: created.id, done: false });

    expect(reverted.done).toBe(false);
  });

  it('更新は一覧にも反映される', async () => {
    const created = await alice.todo.create({ title: '反映確認' });
    await alice.todo.setDone({ id: created.id, done: true });

    const listed = await alice.todo.list();
    expect(listed.map((todo) => todo.done)).toStrictEqual([true]);
  });

  it('削除すると一覧から消える', async () => {
    const kept = await alice.todo.create({ title: '残す' });
    const removed = await alice.todo.create({ title: '消す' });

    await alice.todo.remove({ id: removed.id });

    const titles = (await alice.todo.list()).map((todo) => todo.title);
    expect(titles).toStrictEqual([kept.title]);
  });

  it('同じ id を二度削除すると二度目は NOT_FOUND になる', async () => {
    const created = await alice.todo.create({ title: '二度消す' });
    await alice.todo.remove({ id: created.id });

    const error = await alice.todo.remove({ id: created.id }).catch((cause: unknown) => cause);
    expect(codeOf(error)).toBe('NOT_FOUND');
  });
});

describe('存在しない手続き', () => {
  it('404 を返す', async () => {
    const res = await app.request(`${RPC_ENDPOINT}/todo/unknown`, { method: 'POST' }, env);
    expect(res.status).toBe(404);
  });
});

describe('ヘルスチェック', () => {
  it('ok を返す', async () => {
    const res = await app.request(`${API_BASE_PATH}${HEALTH_ROUTE}`, {}, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toStrictEqual({ status: 'ok' });
  });
});
