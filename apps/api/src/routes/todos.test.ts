import { todoListSchema, todoSchema } from '@seri/contract';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { app } from '../app.ts';

const jsonHeaders = { 'content-type': 'application/json' };

async function postTodo(title: string): Promise<Response> {
  return await app.request(
    '/api/todos',
    { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ title }) },
    env,
  );
}

async function postTodoAndParse(title: string): Promise<{ id: string }> {
  return todoSchema.parse(await (await postTodo(title)).json());
}

beforeEach(async () => {
  await env.DB.prepare('delete from todos').run();
});

describe('GET /api/health', () => {
  it('ok を返す', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toStrictEqual({ status: 'ok' });
  });
});

describe('POST /api/todos', () => {
  it('作成した Todo を 201 で返す', async () => {
    const res = await postTodo('  牛乳を   買う ');
    expect(res.status).toBe(201);
    const body = todoSchema.parse(await res.json());
    expect(body.title).toBe('牛乳を 買う');
    expect(body.done).toBe(false);
  });

  it('空白のみのタイトルは 400 になる', async () => {
    const res = await postTodo('     ');
    expect(res.status).toBe(400);
  });

  it('タイトルが空文字ならバリデーションで 400 になる', async () => {
    const res = await postTodo('');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/todos', () => {
  it('作成した Todo が一覧に含まれる', async () => {
    await postTodo('タスクA');
    const res = await app.request('/api/todos', {}, env);
    expect(res.status).toBe(200);
    const body = todoListSchema.parse(await res.json());
    expect(body.map((todo) => todo.title)).toStrictEqual(['タスクA']);
  });
});

describe('PATCH /api/todos/:id', () => {
  it('完了状態を更新する', async () => {
    const created = await postTodoAndParse('タスクB');
    const res = await app.request(
      `/api/todos/${created.id}`,
      { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ done: true }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(todoSchema.parse(await res.json()).done).toBe(true);
  });

  it('存在しない id は 404 になる', async () => {
    const res = await app.request(
      '/api/todos/00000000-0000-4000-8000-000000000000',
      { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ done: true }) },
      env,
    );
    expect(res.status).toBe(404);
  });

  it('uuid でない id は 400 になる', async () => {
    const res = await app.request(
      '/api/todos/not-a-uuid',
      { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ done: true }) },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/todos/:id', () => {
  it('削除すると 204 を返す', async () => {
    const created = await postTodoAndParse('タスクC');
    const res = await app.request(`/api/todos/${created.id}`, { method: 'DELETE' }, env);
    expect(res.status).toBe(204);
  });

  it('存在しない id は 404 になる', async () => {
    const res = await app.request(
      '/api/todos/00000000-0000-4000-8000-000000000000',
      { method: 'DELETE' },
      env,
    );
    expect(res.status).toBe(404);
  });
});
