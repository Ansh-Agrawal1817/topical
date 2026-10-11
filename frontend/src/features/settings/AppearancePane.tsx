import { ChoiceItem, ChoiceList, Segmented, SettingsGroup, SettingsHeader, SettingsRow } from '@/components/ui';
import { setGlass, setThemePreference, useGlass, useThemePreference, type GlassMode, type ThemePreference } from '@/lib/theme';

const THEMES: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'light', label: 'Light', description: 'Cream paper, warm ink.' },
  { value: 'dark', label: 'Dark', description: 'The same paper under lamplight.' },
  { value: 'system', label: 'Match system', description: 'Follows your device, day and night.' },
];

/** A tiny window in each theme's colours: a bar of glass over a page. */
function ThemeSwatch({ theme }: { theme: ThemePreference }) {
  return (
    <span className="theme-swatch" data-preview={theme} aria-hidden="true">
      <span className="theme-swatch-page" />
      <span className="theme-swatch-bar" />
    </span>
  );
}

export function AppearancePane() {
  const preference = useThemePreference();
  const glass = useGlass();

  return (
    <>
      <SettingsHeader title="Appearance" description="How Topical looks on this device." />

      <SettingsGroup title="Theme">
        <div className="settings-pad">
          <ChoiceList aria-label="Theme" layout="grid">
            {THEMES.map(theme => (
              <ChoiceItem
                key={theme.value}
                selected={preference === theme.value}
                mark={<ThemeSwatch theme={theme.value} />}
                description={theme.description}
                className="choice-item--tile"
                onSelect={() => setThemePreference(theme.value)}
                onClick={event => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setThemePreference(theme.value, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
                }}
              >
                {theme.label}
              </ChoiceItem>
            ))}
          </ChoiceList>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Glass"
        footer="If your device is set to reduce transparency, Topical uses solid surfaces whatever you pick here."
      >
        <SettingsRow
          label="Material"
          hint="Clear lets the page show through the navigation and panels. Tinted is more opaque and easier to read over."
          control={
            <Segmented<GlassMode>
              size="sm"
              aria-label="Glass material"
              value={glass}
              onChange={setGlass}
              options={[{ value: 'clear', label: 'Clear' }, { value: 'tinted', label: 'Tinted' }]}
            />
          }
        />
      </SettingsGroup>
    </>
  );
}
