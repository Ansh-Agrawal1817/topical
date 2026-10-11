import { createFileRoute, Link } from '@tanstack/react-router';
import { KeyRound, Palette, PenLine, Sparkles, UserRound } from 'lucide-react';
import { LoadingState, Page, PageHeader, SideNav, SideNavIcon, SideNavItem } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { ProfilePane } from '@/features/settings/ProfilePane';
import { ModelsPane } from '@/features/settings/ModelsPane';
import { WritingPane } from '@/features/settings/WritingPane';
import { AppearancePane } from '@/features/settings/AppearancePane';
import { AccountPane } from '@/features/settings/AccountPane';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserRound, hue: 'accent', Pane: ProfilePane },
  { id: 'models', label: 'AI models', icon: Sparkles, hue: 'latex', Pane: ModelsPane },
  { id: 'writing', label: 'Writing', icon: PenLine, hue: 'success', Pane: WritingPane },
  { id: 'appearance', label: 'Appearance', icon: Palette, hue: 'warning', Pane: AppearancePane },
  { id: 'account', label: 'Account', icon: KeyRound, hue: 'neutral', Pane: AccountPane },
] as const;

export type SettingsSection = (typeof SECTIONS)[number]['id'];
/**
 * The section names alone, for `validateSearch`. Route options are not code
 * split, so reading `SECTIONS` there pulled every pane — and through the
 * models pane every provider logo — into the bundle every page loads.
 */
const SECTION_IDS: readonly string[] = ['profile', 'models', 'writing', 'appearance', 'account'] satisfies SettingsSection[];

export interface SettingsSearch {
  section?: SettingsSection;
}

/**
 * Everything you can set, in one place, sectioned like system settings.
 *
 * It replaces three screens — the account page, profile editing and AI
 * providers — that each had their own header and back link, so changing a
 * model meant going to "Profile" first. The section is in the URL, so a link
 * (the key dialog's, the command palette's) can open the right one.
 */
export const Route = createFileRoute('/_authenticated/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    section: SECTION_IDS.includes(search.section as string) ? (search.section as SettingsSection) : undefined,
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, isLoading } = useAuth();
  const { section = 'profile' } = Route.useSearch();
  const current = SECTIONS.find(s => s.id === section) ?? SECTIONS[0];

  if (isLoading || !user) return <LoadingState size="page" label="Loading settings…" />;

  return (
    <Page>
      <PageHeader section="Settings" title="Settings" subtitle="Your profile, the models you write with, and how Topical looks and behaves." />

      <div className="settings-layout">
        <SideNav aria-label="Settings sections" className="settings-nav">
          {SECTIONS.map(({ id, label, icon: Icon, hue }) => (
            <SideNavItem key={id} asChild active={id === current.id}>
              <Link to="/settings" search={{ section: id }} replace>
                <SideNavIcon hue={hue}><Icon className="h-3.5 w-3.5" /></SideNavIcon>
                {label}
              </Link>
            </SideNavItem>
          ))}
        </SideNav>

        <div className="settings-pane" key={current.id}>
          <current.Pane />
        </div>
      </div>
    </Page>
  );
}
