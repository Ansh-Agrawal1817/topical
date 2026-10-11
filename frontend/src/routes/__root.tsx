/**
 * The shell every route renders inside: navigation, command palette,
 * onboarding, and the toast surface.
 *
 * The editor route opts out of the page padding and top margin — it manages
 * its own full-height layout, and the shared chrome would push it off-screen.
 */

import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { Avatar, Button, Divider, IconButton, Kbd, Toaster, Row, Stack } from '@/components/ui';
import { OnboardingModal } from "@/components/OnboardingModal";
import { AiKeyHost } from "@/components/AiKeyHost";
import { ConfirmHost } from "@/components/ConfirmHost";
import { type QueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef } from "react";
import { Command, FolderOpen, Users, Search, Settings } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { useAuth } from "@/lib/auth-context";
import { CommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandMark } from "@/components/BrandMark";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: Root,
});

function NavBar({ onOpenCommand }: { onOpenCommand: () => void }) {
  const { isAuthenticated, user } = useAuth();
  /* Selected, not the whole router state. A bare `useRouterState()` subscribes
     this component to every field of it — including the transition status,
     which changes several times per navigation — so the nav re-rendered, and
     re-measured its sliding lens, repeatedly during a single route change.
     The pathname is the only part it reads. */
  const currentPath = useRouterState({ select: state => state.location.pathname });
  const isActive = (path: string) => currentPath === path || currentPath.startsWith(`${path}/`);

  const links = isAuthenticated
    ? [
        { to: '/projects', label: 'Projects', icon: FolderOpen },
        { to: '/community', label: 'Community', icon: Users },
      ]
    : [{ to: '/community', label: 'Community', icon: Users }];
  // The phone's tab bar carries Settings as well: there is no hover-revealed
  // menu to find it in, and the avatar is a small target in the top corner.
  const tabs = isAuthenticated ? [...links, { to: '/settings', label: 'Settings', icon: Settings }] : links;

  // The lens that slides between links: one element that moves, so switching
  // pages reads as the glass flowing to its new place rather than a jump cut.
  const shellRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  useEffect(() => {
    const measure = () => {
      const shell = shellRef.current;
      if (!shell) return;
      const active = shell.querySelector<HTMLElement>("[data-active='true']");
      if (!active) { setIndicator(prev => (prev === null ? prev : null)); return; }
      const a = active.getBoundingClientRect();
      const s = shell.getBoundingClientRect();
      const next = { x: a.left - s.left, w: a.width };
      /* Bail out when nothing moved: each run allocates a fresh object, and
         React would re-render the bar for a lens already in place. */
      setIndicator(prev => (prev && prev.x === next.x && prev.w === next.w ? prev : next));
    };
    measure();
    window.addEventListener('resize', measure);
    // Fonts land after first paint and change link widths.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener('resize', measure);
  }, [currentPath, isAuthenticated]);

  /* Content scrolls under the floating bar. Once it does, the bar takes a
     deeper shadow, so the edge between glass and page stays legible. */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The marketing pages own the bottom of the screen; the tab bar is for the app.
  const showTabBar = currentPath !== '/' && currentPath !== '/about';

  return (
    <>
      {/* Desktop: the glass pill floating over the page. `nav-glass` supplies
          the tint and blur, `liquid-glass` the lit top edge. */}
      <nav id="main-nav" className="site-nav nav-glass liquid-glass" data-scrolled={scrolled} aria-label="Main">
        <Link to="/" className="site-nav-home" data-active={currentPath === '/'} aria-label="Topical home">
          {/* Alive on the landing only: on app screens, seen all day, it keeps still. */}
          <BrandMark alive={currentPath === '/'} />
        </Link>

        <Divider orientation="vertical" space="xs" />

        <div className="nav-shell" ref={shellRef}>
          <span
            className="nav-indicator"
            aria-hidden="true"
            style={{
              width: indicator?.w ?? 0,
              transform: `translate(${indicator?.x ?? 0}px, -50%)`,
              opacity: indicator ? 1 : 0,
            }}
          />
          {links.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="nav-link" data-active={isActive(to)} aria-current={isActive(to) ? 'page' : undefined}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </div>

        <Divider orientation="vertical" space="xs" />

        <IconButton size="lg" onClick={onOpenCommand} title="Command palette" aria-label="Open command palette">
          <Command className="h-3 w-3" /><Kbd variant="bare">K</Kbd>
        </IconButton>

        <ThemeToggle className="ml-1" />

        {isAuthenticated ? (
          <Link to="/settings" className="ml-2" title="Settings" aria-label="Settings">
            <Avatar size="sm" shape="circle" className="nav-avatar" seed={user?.id} src={user?.avatarUrl || user?.picture || null} name={user?.given_name || user?.username || null} />
          </Link>
        ) : (
          <Button asChild variant="primary" size="md" shape="pill" className="ml-1">
            <Link to="/login">Sign in</Link>
          </Button>
        )}
      </nav>

      {/* Phone: a slim bar at the top, and the places in a tab bar at the bottom, in thumb's reach. */}
      <div className="mobile-bar nav-glass" data-scrolled={scrolled}>
        <Link to="/" aria-label="Topical home">
          <BrandMark size="md" alive={currentPath === '/'} />
        </Link>
        <Row align="center" gap={1}>
          <IconButton size="lg" onClick={onOpenCommand} aria-label="Search and commands">
            <Search className="h-4 w-4" />
          </IconButton>
          {isAuthenticated ? <AccountMenu /> : (
            <>
              <ThemeToggle />
              <Button asChild variant="primary" size="md" shape="pill">
                <Link to="/login">Sign in</Link>
              </Button>
            </>
          )}
        </Row>
      </div>

      {showTabBar && (
        <nav className="tab-bar nav-glass liquid-glass" aria-label="Sections">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="tab-bar-item" data-active={isActive(to)} aria-current={isActive(to) ? 'page' : undefined}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}


function Root() {
  const { isAuthenticated } = useAuth();

  /**
   * Whether a document is on screen — read or write.
   *
   * Both are the same full-height application shell: reading is the document
   * screen with its writing surface absent, not a page in the site chrome, so
   * both take the viewport over and both carry their own way back out. Any
   * path below `/projects/` is a document; `/projects` itself is the list.
   *
   * Selected down to a boolean on purpose. This was `useRouterState()` with no
   * selector, which subscribes the entire application shell to every change in
   * router state — every navigation re-rendered the shell, the nav bar, the
   * command palette and the toaster several times over, before the destination
   * had even mounted. Now the shell re-renders only when the answer flips.
   */
  const isEditorRoute = useRouterState({
    select: state => state.location.pathname.startsWith('/projects/'),
  });
  /* The marketing pages keep the bottom of a phone's screen; every other page
     leaves room there for the tab bar. */
  const isMarketing = useRouterState({
    select: state => state.location.pathname === '/' || state.location.pathname === '/about',
  });
  const [commandOpen, setCommandOpen] = useState(false);
  /* Stable, because the palette memoises its command list against it. As an
     inline arrow this changed identity on every render of the shell — which
     happens on every route change — so the whole list, including one entry
     per document, was rebuilt and re-rendered each time. */
  const closeCommand = useCallback(() => setCommandOpen(false), []);

  // ⌘K / Ctrl-K anywhere, including the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    /* The editor is a fixed application shell, not a document: it sizes itself
       to the viewport and scrolls inside its own panes. `min-h-dvh` lets the
       page grow past the viewport, so any stray height from a sibling made the
       whole shell scrollable — you could drag the page and leave blank ground
       below the status bar. On the editor route the shell is pinned to the
       viewport and told not to scroll; every other route keeps growing. */
    <Stack className={isEditorRoute ? 'h-dvh overflow-hidden relative' : 'min-h-dvh relative'}>
      {!isEditorRoute && <div className="grid-bg" />}
      {!isEditorRoute && <NavBar onOpenCommand={() => setCommandOpen(true)} />}
      <CommandPalette
        open={commandOpen}
        onClose={closeCommand}
        isAuthenticated={isAuthenticated}
      />
      <OnboardingModal />
      <AiKeyHost />
      <ConfirmHost />
      <main className={`flex-1 w-full mx-auto relative z-10 ${isEditorRoute ? 'min-h-0' : `px-4 py-6 mt-20 md:mt-24 ${isMarketing ? '' : 'max-md:pb-28'}`}`}>
        <Outlet />
      </main>
      <Toaster />
    </Stack>
  );
}
