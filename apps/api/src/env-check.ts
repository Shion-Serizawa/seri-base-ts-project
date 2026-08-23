import type { Bindings } from './env.ts';

/** `T` が never でなければ型エラーになる。 */
type AssertNever<T extends never> = T;

/**
 * `wrangler types` が wrangler.jsonc から生成した `Cloudflare.Env` のバインディング名が
 * すべて手書きの `Bindings` に存在することを検証する。
 * wrangler.jsonc にバインディングを追加したら `bun run cf-typegen` を実行し、env.ts も更新する。
 *
 * 値の型ではなくキーの網羅を見ているのは、`Bindings` があえて可搬な型（drizzle の
 * `AnyD1Database`）を使っており、Workers の `D1Database` とは一致しないため。
 * TEST_MIGRATIONS は test/env.d.ts がテスト用に注入するもので、本番の Worker には無い。
 *
 * このファイルはどこからも import されない（型検査専用）。
 */
type MissingBindingNames = Exclude<keyof Omit<Cloudflare.Env, 'TEST_MIGRATIONS'>, keyof Bindings>;

export type NoMissingBindings = AssertNever<MissingBindingNames>;
