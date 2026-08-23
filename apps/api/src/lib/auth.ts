import { createDb, schema } from '@seri/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import type { Bindings } from '../env.ts';

// betterAuth() の戻り値は渡したオプションに依存して型が決まるため、
// 一度ローカル関数を通して推論させた型を公開する
// （`ReturnType<typeof betterAuth>` では型が広くなりすぎる）。
function build(env: Bindings) {
  return betterAuth({
    database: drizzleAdapter(createDb(env.DB), {
      provider: 'sqlite',
      schema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true },
  });
}

export type Auth = ReturnType<typeof build>;

/**
 * better-auth のインスタンス。Workers ではバインディングがリクエスト単位で渡るため、
 * モジュールトップではなくリクエストごとに生成する。
 */
export function createAuth(env: Bindings): Auth {
  return build(env);
}
