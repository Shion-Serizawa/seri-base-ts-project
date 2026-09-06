import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { a11yViolations } from '../../../test/a11y.ts';
import { renderWithQuery } from '../../../test/render.tsx';
import { TodosPage } from './todos-page.tsx';

/**
 * oRPC クライアントをテストダブルに差し替える。
 * ワイヤ形式・契約のバリデーション・D1 アクセスは apps/api 側の統合テストで検証しているので、
 * ここではコンポーネントの振る舞いだけを見る。
 */
const mocks = vi.hoisted(() => ({
  list: vi.fn<() => Promise<unknown>>(),
  create: vi.fn<() => Promise<unknown>>(),
  setDone: vi.fn<() => Promise<unknown>>(),
  remove: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('../../lib/api-client.ts', () => ({
  apiClient: { todo: mocks },
}));

const validId = '00000000-0000-4000-8000-000000000000';

function todo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: validId,
    title: 'サンプル',
    done: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mocks.list.mockResolvedValue([]);
  mocks.create.mockResolvedValue(todo());
  mocks.setDone.mockResolvedValue(todo({ done: true }));
});

describe('TodosPage', () => {
  it('取得した Todo を一覧表示する', async () => {
    mocks.list.mockResolvedValue([todo({ title: '牛乳を買う' })]);
    renderWithQuery(<TodosPage />);

    expect(await screen.findByText('牛乳を買う')).toBeInTheDocument();
  });

  it('取得中は読み込み表示を出す', () => {
    renderWithQuery(<TodosPage />);

    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
  });

  it('取得に失敗するとエラーを表示する', async () => {
    mocks.list.mockRejectedValue(new Error('boom'));
    renderWithQuery(<TodosPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('入力して送信すると create を呼ぶ', async () => {
    renderWithQuery(<TodosPage />);

    await userEvent.type(screen.getByLabelText('やること'), '新しいタスク');
    await userEvent.click(screen.getByRole('button', { name: '追加' }));

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith({ title: '新しいタスク' }, expect.anything());
    });
  });

  it('空白のみの入力では create を呼ばない', async () => {
    renderWithQuery(<TodosPage />);

    await userEvent.type(screen.getByLabelText('やること'), '   ');
    await userEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('チェックボックスを操作すると setDone を呼ぶ', async () => {
    mocks.list.mockResolvedValue([todo()]);
    renderWithQuery(<TodosPage />);

    await userEvent.click(await screen.findByRole('checkbox'));

    await waitFor(() => {
      expect(mocks.setDone).toHaveBeenCalledWith({ id: validId, done: true }, expect.anything());
    });
  });

  it('アクセシビリティ違反が無い', async () => {
    mocks.list.mockResolvedValue([todo(), todo({ done: true })]);
    renderWithQuery(<TodosPage />);
    await screen.findAllByRole('checkbox');

    await expect(a11yViolations()).resolves.toStrictEqual([]);
  });
});
