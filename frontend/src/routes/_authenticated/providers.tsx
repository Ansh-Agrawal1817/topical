import { createFileRoute, redirect } from '@tanstack/react-router';

/** `/providers`, kept only to forward links that already exist: AI models live in Settings now. */
export const Route = createFileRoute('/_authenticated/providers')({
  beforeLoad: () => {
    throw redirect({ to: '/settings', search: { section: 'models' }, replace: true });
  },
});
