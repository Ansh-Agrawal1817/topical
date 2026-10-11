import { useCallback, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, Eye, LogOut, Monitor, Moon, Settings, Sparkles, Sun } from 'lucide-react';
import { Avatar, Divider, MenuItem, MenuPanel, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { setThemePreference, useThemePreference, type ThemePreference } from '@/lib/theme';
import { useDismiss } from '@/hooks/useDismiss';

/**
 * The avatar in the nav, and what it opens: who you are signed in as, your
 * public page, settings, the theme, and signing out. It used to be a bare
 * link to an account page — pressing your own face to find the theme switch
 * or the way out was a guess nobody should have to make.
 */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(close);
  const preference = useThemePreference();

  if (!user) return null;
  const name = [user.given_name, user.family_name].filter(Boolean).join(' ') || user.username || 'You';
  const avatarSrc = user.avatarUrl || user.picture || null;

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen(o => !o)}
      >
        <Avatar size="sm" shape="circle" seed={user.id} src={avatarSrc} name={name} />
        <ChevronDown className="account-trigger-chevron h-3 w-3" aria-hidden="true" />
      </button>

      {open && (
        <MenuPanel origin="top-right" inset="md" className="account-panel" role="menu">
          <div className="account-panel-head">
            <Avatar size="md" shape="circle" seed={user.id} src={avatarSrc} name={name} />
            <div className="min-w-0">
              <div className="account-panel-name">{name}</div>
              <div className="account-panel-handle">{user.username ? `@${user.username}` : user.email}</div>
            </div>
          </div>

          {user.username && (
            <MenuItem asChild onClick={close}>
              <Link to="/u/$username" params={{ username: user.username }}>
                <span className="menu-item-icon"><Eye className="h-3.5 w-3.5" /></span>Your public profile
              </Link>
            </MenuItem>
          )}
          <MenuItem asChild onClick={close}>
            <Link to="/settings">
              <span className="menu-item-icon"><Settings className="h-3.5 w-3.5" /></span>Settings
            </Link>
          </MenuItem>
          <MenuItem asChild onClick={close}>
            <Link to="/settings" search={{ section: 'models' }}>
              <span className="menu-item-icon"><Sparkles className="h-3.5 w-3.5" /></span>AI models
            </Link>
          </MenuItem>

          <Divider space="xs" />
          <div className="account-panel-theme">
            <span>Theme</span>
            <Segmented<ThemePreference>
              size="xs"
              iconOnly
              aria-label="Theme"
              value={preference}
              onChange={setThemePreference}
              options={[
                { value: 'light', label: 'Light', 'aria-label': 'Light', title: 'Light', icon: <Sun className="h-3.5 w-3.5" /> },
                { value: 'dark', label: 'Dark', 'aria-label': 'Dark', title: 'Dark', icon: <Moon className="h-3.5 w-3.5" /> },
                { value: 'system', label: 'System', 'aria-label': 'Match system', title: 'Match system', icon: <Monitor className="h-3.5 w-3.5" /> },
              ]}
            />
          </div>
          <Divider space="xs" />

          <MenuItem icon={<LogOut className="h-3.5 w-3.5" />} onClick={() => { close(); logout(); }}>
            Sign out
          </MenuItem>
        </MenuPanel>
      )}
    </div>
  );
}
