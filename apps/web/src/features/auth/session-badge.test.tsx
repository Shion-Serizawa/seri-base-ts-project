import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { a11yViolations } from '../../../test/a11y.ts';
import { SessionBadge } from './session-badge.tsx';

describe('SessionBadge', () => {
  it('取得中は確認中を表示する', () => {
    render(<SessionBadge user={undefined} isPending={true} />);
    expect(screen.getByText('確認中…')).toBeInTheDocument();
  });

  it('未サインインを表示する', () => {
    render(<SessionBadge user={undefined} isPending={false} />);
    expect(screen.getByText('未サインイン')).toBeInTheDocument();
  });

  it('サインイン済みなら名前を表示し、メールアドレスを title に入れる', () => {
    render(
      <SessionBadge user={{ name: 'テスト太郎', email: 'test@example.com' }} isPending={false} />,
    );
    expect(screen.getByTitle('test@example.com')).toHaveTextContent('テスト太郎');
  });

  it('アクセシビリティ違反が無い', async () => {
    render(
      <SessionBadge user={{ name: 'テスト太郎', email: 'test@example.com' }} isPending={false} />,
    );
    await expect(a11yViolations()).resolves.toStrictEqual([]);
  });
});
