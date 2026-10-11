import { LogOut } from 'lucide-react';
import { Button, DetailEmpty, SettingsGroup, SettingsHeader, SettingsRow } from '@/components/ui';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import { useAuth } from '@/lib/auth-context';

/** Sign-in details, the password, and signing out — the parts only you see. */
export function AccountPane() {
  const { user, logout, isNavigating } = useAuth();
  if (!user) return null;

  return (
    <>
      <SettingsHeader title="Account" description="How you sign in. Nothing on this page is public." />

      <SettingsGroup>
        <SettingsRow label="Email" control={<span className="settings-value">{user.email || <DetailEmpty>Not set</DetailEmpty>}</span>} />
        <SettingsRow
          label="Username"
          control={<span className="settings-value">{user.username ? <span className="person-handle">@{user.username}</span> : <DetailEmpty>Not set</DetailEmpty>}</span>}
        />
        <SettingsRow label="Member id" control={<span className="settings-value settings-value--mono">{user.id}</span>} />
      </SettingsGroup>

      <SettingsGroup title="Password" description="Changing it signs out every other browser you are signed in on.">
        <div className="settings-pad">
          <ChangePasswordForm />
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          label="Sign out"
          hint="Ends this session. Your documents stay where they are."
          control={
            <Button variant="secondary" size="md" onClick={logout} loading={isNavigating}>
              {!isNavigating && <><LogOut className="h-3.5 w-3.5" /> Sign out</>}
            </Button>
          }
        />
      </SettingsGroup>
    </>
  );
}
