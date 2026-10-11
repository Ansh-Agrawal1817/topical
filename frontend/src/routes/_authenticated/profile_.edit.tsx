import { createFileRoute, redirect } from '@tanstack/react-router';

/** `/profile/edit`, kept only to forward links that already exist: profile editing lives in Settings now. */
export const Route = createFileRoute('/_authenticated/profile_/edit')({
  beforeLoad: () => {
    throw redirect({ to: '/settings', search: { section: 'profile' }, replace: true });
  },
});
