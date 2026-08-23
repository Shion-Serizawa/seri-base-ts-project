import type { AnyD1Database } from 'drizzle-orm/d1';
import { drizzle } from 'drizzle-orm/d1';

import * as schema from './schema.ts';

export type Database = ReturnType<typeof createDb>;

/**
 * D1 バインディングから Drizzle クライアントを作る。
 *
 * 引数の型に Workers のグローバル型（D1Database）ではなく drizzle の `AnyD1Database` を使う。
 * これにより apps/web 側（ブラウザ型環境）からこのパッケージを型解決しても壊れない。
 */
export function createDb(d1: AnyD1Database): ReturnType<typeof drizzle<typeof schema>> {
  return drizzle(d1, { schema });
}

export { schema };
export { todos } from './schema.ts';
export type { NewTodoRow, TodoRow } from './schema.ts';
