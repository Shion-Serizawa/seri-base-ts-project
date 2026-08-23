import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { app } from '../app.ts';

const credentials = {
  name: 'テスト太郎',
  email: 'test@example.com',
  password: 'correct-horse-battery-staple',
};

async function post(path: string, body: unknown, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== undefined) {
    headers['cookie'] = cookie;
  }
  return await app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, env);
}

function requireSetCookie(res: Response): string {
  const cookie = res.headers.get('set-cookie');
  if (cookie === null) {
    throw new Error('set-cookie ヘッダが無い');
  }
  return cookie;
}

beforeEach(async () => {
  await env.DB.prepare('delete from session').run();
  await env.DB.prepare('delete from account').run();
  await env.DB.prepare('delete from user').run();
});

describe('better-auth の email + password', () => {
  it('サインアップに成功しセッション Cookie を返す', async () => {
    const res = await post('/api/auth/sign-up/email', credentials);

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('session_token');
  });

  it('同じメールアドレスで二重登録できない', async () => {
    await post('/api/auth/sign-up/email', credentials);
    const res = await post('/api/auth/sign-up/email', credentials);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('サインアップしたユーザーでサインインできる', async () => {
    await post('/api/auth/sign-up/email', credentials);
    const res = await post('/api/auth/sign-in/email', {
      email: credentials.email,
      password: credentials.password,
    });

    expect(res.status).toBe(200);
  });

  it('誤ったパスワードではサインインできない', async () => {
    await post('/api/auth/sign-up/email', credentials);
    const res = await post('/api/auth/sign-in/email', {
      email: credentials.email,
      password: 'wrong-password',
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('Cookie を渡すとセッションを取得できる', async () => {
    const signUp = await post('/api/auth/sign-up/email', credentials);
    const cookie = requireSetCookie(signUp);

    const res = await app.request('/api/auth/get-session', { headers: { cookie } }, env);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain(credentials.email);
  });

  it('Cookie が無ければセッションは空になる', async () => {
    const res = await app.request('/api/auth/get-session', {}, env);

    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain(credentials.email);
  });
});
