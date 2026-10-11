import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AlertCircle, AtSign, Check, Eye } from 'lucide-react';
import { Button, Row, SettingsGroup, SettingsHeader, Text } from '@/components/ui';
import { ProfileEditorFields } from '@/components/ProfileEditorFields';
import { useAuth } from '@/lib/auth-context';
import { updateProfile } from '@/lib/api';
import { errorMessage } from '@/lib/utils';
// The server enforces this same rule on PATCH /api/profile.
import { usernameProblem } from '@/lib/validation';

/** Name, handle, picture and bio — what other members see. */
export function ProfilePane() {
  const { user, refetchUser } = useAuth();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setUsername(user.username || '');
    setBio(user.bio || '');
    setAvatarUrl(user.avatarUrl || null);
  }, [user]);

  if (!user) return null;

  const dirty = username !== (user.username || '') || bio !== (user.bio || '') || avatarUrl !== (user.avatarUrl || null);
  const usernameError = usernameProblem(username);

  const save = async () => {
    if (usernameError) { toast.error(usernameError); return; }
    setSaving(true);
    try {
      await updateProfile({ username: username || undefined, bio, avatarUrl });
      await refetchUser?.();
      toast.success('Profile saved');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save your profile'));
    } finally {
      setSaving(false);
    }
  };

  const revert = () => {
    setUsername(user.username || '');
    setBio(user.bio || '');
    setAvatarUrl(user.avatarUrl || null);
  };

  return (
    <>
      <SettingsHeader
        title="Profile"
        description="What other members see next to your discussions and published documents."
        actions={user.username && (
          <Button asChild variant="secondary" size="md">
            <Link to="/u/$username" params={{ username: user.username }}><Eye className="h-3.5 w-3.5" /> View public profile</Link>
          </Button>
        )}
      />

      <SettingsGroup
        footer={
          <Row as="span" align="start" gap={1.5}>
            {usernameError ? (
              <><AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px text-[var(--status-danger)]" /><Text as="span" size="xs" tone="danger">{usernameError}</Text></>
            ) : username ? (
              <><Check className="h-3.5 w-3.5 shrink-0 mt-px text-[var(--status-success)]" /><span>Your profile lives at <span className="person-handle">/u/{username}</span></span></>
            ) : (
              <><AtSign className="h-3.5 w-3.5 shrink-0 mt-px" /><span>Pick a username before publishing documents to the community.</span></>
            )}
          </Row>
        }
      >
        <div className="settings-pad">
          <ProfileEditorFields
            avatarUrl={avatarUrl}
            onAvatarChange={setAvatarUrl}
            fallbackAvatar={user.picture}
            seed={user.id}
            fallbackInitial={user.given_name?.[0] || 'U'}
            username={username}
            onUsernameChange={setUsername}
            bio={bio}
            onBioChange={setBio}
            disabled={saving}
          />
        </div>
      </SettingsGroup>

      <Row align="center" gap={2.5} className="settings-actions">
        <Button variant="primary" size="lg" onClick={save} loading={saving} disabled={!dirty || !!usernameError}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
        {dirty && !saving && <Button variant="ghost" size="lg" onClick={revert}>Discard changes</Button>}
      </Row>
    </>
  );
}
