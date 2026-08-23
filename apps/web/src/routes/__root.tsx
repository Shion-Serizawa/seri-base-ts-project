import { createRootRoute, Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';

import { SessionBadge } from '../features/auth/session-badge.tsx';
import { useSession } from '../lib/auth-client.ts';

function RootLayout(): JSX.Element {
  const session = useSession();

  return (
    <>
      <header>
        <h1>seri base</h1>
        <SessionBadge user={session.data?.user} isPending={session.isPending} />
      </header>
      <Outlet />
    </>
  );
}

export const Route = createRootRoute({ component: RootLayout });
