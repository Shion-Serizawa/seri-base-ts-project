import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { jsonResponse, renderWithQuery, stubFetch } from '../../../test/render.tsx';
import { TodosPage } from './todos-page.tsx';

const validId = '00000000-0000-4000-8000-000000000000';

function todoJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: validId,
    title: 'サンプル',
    done: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TodosPage', () => {
  it('取得した Todo を一覧表示する', async () => {
    stubFetch({ GET: () => jsonResponse([todoJson({ title: '牛乳を買う' })]) });
    renderWithQuery(<TodosPage />);

    expect(await screen.findByText('牛乳を買う')).toBeInTheDocument();
  });

  it('取得中は読み込み表示を出す', () => {
    stubFetch({ GET: () => jsonResponse([]) });
    renderWithQuery(<TodosPage />);

    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
  });

  it('取得に失敗するとエラーを表示する', async () => {
    stubFetch({ GET: () => jsonResponse({ message: 'boom' }, 500) });
    renderWithQuery(<TodosPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('入力して送信すると POST し、一覧を再取得する', async () => {
    const { calls } = stubFetch({
      GET: () => jsonResponse([]),
      POST: () => jsonResponse(todoJson(), 201),
    });
    renderWithQuery(<TodosPage />);

    await userEvent.type(screen.getByLabelText('やること'), '新しいタスク');
    await userEvent.click(screen.getByRole('button', { name: '追加' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST')).toBe(true);
    });
    const posted = calls.find((call) => call.method === 'POST');
    expect(posted?.body).toContain('新しいタスク');
  });

  it('空白のみの入力では送信しない', async () => {
    const { calls } = stubFetch({ GET: () => jsonResponse([]) });
    renderWithQuery(<TodosPage />);

    await userEvent.type(screen.getByLabelText('やること'), '   ');
    await userEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('チェックボックスを操作すると PATCH する', async () => {
    const { calls } = stubFetch({
      GET: () => jsonResponse([todoJson()]),
      PATCH: () => jsonResponse(todoJson({ done: true })),
    });
    renderWithQuery(<TodosPage />);

    await userEvent.click(await screen.findByRole('checkbox'));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    });
  });
});
