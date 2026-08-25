import { oc } from '@orpc/contract';
import { z } from 'zod';

import {
  createTodoInputSchema,
  todoIdSchema,
  todoListSchema,
  todoSchema,
  updateTodoInputSchema,
} from './todo.ts';

const todoIdInputSchema = z.object({ id: todoIdSchema });

/**
 * すべての手続きに共通の前提: 認証済みであること。
 * 未認証は UNAUTHORIZED、他人の Todo は NOT_FOUND（存在を漏らさないため）を返す。
 */
const authenticated = oc.errors({
  UNAUTHORIZED: { message: '認証が必要です' },
});

/**
 * Todo の API 契約。
 *
 * 入出力スキーマとエラーの種類をここで宣言し、サーバ（apps/api）はこれを実装し、
 * クライアント（apps/web）はこれから型を得る。実装から型を導出する方式（Hono RPC）と違い、
 * **契約だけを先に確定させてフロントとバックが並行作業できる**のが目的。
 *
 * Todo はユーザーに属する。一覧・更新・削除はすべてセッションのユーザーに限定される
 * （スコープの強制はサーバ側の責務。契約はそれを表現するために UNAUTHORIZED を持つ）。
 */
const todoContract = {
  list: authenticated.output(todoListSchema),

  create: authenticated
    .input(createTodoInputSchema)
    .output(todoSchema)
    .errors({
      BLANK_TITLE: { message: 'タイトルが空白のみです' },
    }),

  setDone: authenticated
    .input(todoIdInputSchema.extend(updateTodoInputSchema.shape))
    .output(todoSchema)
    .errors({
      NOT_FOUND: { message: 'Todo が見つかりません' },
    }),

  remove: authenticated
    .input(todoIdInputSchema)
    .output(todoIdInputSchema)
    .errors({
      NOT_FOUND: { message: 'Todo が見つかりません' },
    }),
};

/** アプリ全体の API 契約。 */
export const apiContract = {
  todo: todoContract,
};
