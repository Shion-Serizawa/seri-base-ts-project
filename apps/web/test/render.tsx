import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

/** リトライ無効の QueryClient で包んで描画する（テストの待ち時間を作らないため）。 */
export function renderWithQuery(ui: ReactElement): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

export type FetchCall = {
  readonly url: string;
  readonly method: string;
  readonly body: string | undefined;
};

const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
type Handlers = Partial<Record<HttpMethod, (call: FetchCall) => Response>>;

function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.some((method) => method === value);
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * fetch をスタブする。メソッドごとの応答を宣言で渡すことで、
 * テスト本体に条件分岐を持ち込まないようにしている。
 */
export function stubFetch(handlers: Handlers): { readonly calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchStub = (input: unknown, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const call: FetchCall = {
      url: String(input),
      method,
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    calls.push(call);
    const handler = isHttpMethod(method) ? handlers[method] : undefined;
    return Promise.resolve((handler ?? (() => jsonResponse([])))(call));
  };
  vi.stubGlobal('fetch', fetchStub);
  return { calls };
}
