/**
 * API のパス。サーバ（マウント先）とクライアント（接続先）とテストで共有する。
 *
 * ここに置く理由: 以前は apps/api の basePath と apps/web のクライアント URL に
 * `/api/rpc` という文字列が別々に書かれていた。契約と同じ場所に置けば、
 * 片方だけ変えて動かなくなることがない。
 */
export const API_BASE_PATH = '/api';

/** API_BASE_PATH からの相対パス（Hono の basePath 配下のルート定義に使う）。 */
export const RPC_ROUTE = '/rpc';
export const AUTH_ROUTE = '/auth';
export const HEALTH_ROUTE = '/health';

/** 絶対パス（クライアントの接続先、oRPC ハンドラの prefix に使う）。 */
export const RPC_ENDPOINT = `${API_BASE_PATH}${RPC_ROUTE}`;
export const AUTH_ENDPOINT = `${API_BASE_PATH}${AUTH_ROUTE}`;
