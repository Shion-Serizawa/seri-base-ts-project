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
 * Todo の API 契約。
 *
 * 入出力スキーマとエラーの種類をここで宣言し、サーバ（apps/api）はこれを実装し、
 * クライアント（apps/web）はこれから型を得る。実装から型を導出する方式（Hono RPC）と違い、
 * **契約だけを先に確定させてフロントとバックが並行作業できる**のが目的。
 */
export const todoContract = {
  list: oc.output(todoListSchema),

  create: oc
    .input(createTodoInputSchema)
    .output(todoSchema)
    .errors({
      BLANK_TITLE: { message: 'タイトルが空白のみです' },
    }),

  setDone: oc
    .input(todoIdInputSchema.extend(updateTodoInputSchema.shape))
    .output(todoSchema)
    .errors({
      NOT_FOUND: { message: 'Todo が見つかりません' },
    }),

  remove: oc
    .input(todoIdInputSchema)
    .output(z.object({ id: todoIdSchema }))
    .errors({
      NOT_FOUND: { message: 'Todo が見つかりません' },
    }),
};

/** アプリ全体の API 契約。 */
export const apiContract = {
  todo: todoContract,
};
