import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// 各テストファイルの実行前に、生成済みマイグレーションをインメモリ D1 に適用する。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
