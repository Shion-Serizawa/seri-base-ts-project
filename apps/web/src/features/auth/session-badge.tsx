import type { JSX } from 'react';

type SessionUser = {
  readonly email: string;
  readonly name: string;
};

type Props = {
  readonly user: SessionUser | undefined;
  readonly isPending: boolean;
};

/**
 * セッション表示。データ取得は呼び出し側（ルート）が行い、ここは純粋な表示に閉じる。
 * こうすることでこのコンポーネントは副作用なしでテストできる。
 */
export function SessionBadge({ user, isPending }: Props): JSX.Element {
  if (isPending) {
    return <span aria-live="polite">確認中…</span>;
  }
  if (user === undefined) {
    return <span>未サインイン</span>;
  }
  return <span title={user.email}>{user.name}</span>;
}
