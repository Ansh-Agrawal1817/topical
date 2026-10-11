import { createFileRoute, redirect } from '@tanstack/react-router';

/** `/profile`, kept only to forward links that already exist: the account lives in Settings now. */
export const Route = createFileRoute('/_authenticated/profile')({
  beforeLoad: () => {
    throw redirect({ to: '/settings', search: { section: 'profile' }, replace: true });
  },
});
