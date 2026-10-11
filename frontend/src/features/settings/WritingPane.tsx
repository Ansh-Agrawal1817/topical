import { useState } from 'react';
import { Code2, Eye } from 'lucide-react';
import { Segmented, SettingsGroup, SettingsHeader, SettingsRow, Switch } from '@/components/ui';
import { loadOptions, saveOptions, type SurfaceMode, type ViewOptions } from '@/features/editor/lib/viewOptions';

const SIZES = ['15', '16', '17', '18', '20'] as const;

/**
 * How the editor opens. These are the same preferences the editor's own
 * View menu changes, read from the same place, so either one is the truth.
 */
export function WritingPane() {
  const [options, setOptions] = useState<ViewOptions>(loadOptions);
  const set = <K extends keyof ViewOptions>(key: K, value: ViewOptions[K]) => {
    const next = { ...options, [key]: value };
    setOptions(next);
    saveOptions(next);
  };

  return (
    <>
      <SettingsHeader title="Writing" description="How documents open for editing. Changes apply the next time you open one." />

      <SettingsGroup title="The page">
        <SettingsRow
          label="Editor opens in"
          hint="Live renders as you type and shows markup only where the caret is. Source is the plain text."
          control={
            <Segmented<SurfaceMode>
              size="sm"
              aria-label="Editor opens in"
              value={options.surface}
              onChange={v => set('surface', v)}
              options={[
                { value: 'live', label: 'Live', icon: <Eye className="h-3.5 w-3.5" /> },
                { value: 'source', label: 'Source', icon: <Code2 className="h-3.5 w-3.5" /> },
              ]}
            />
          }
        />
        <SettingsRow
          label="Text size"
          hint="The size of the writing, in pixels."
          control={
            <Segmented
              size="sm"
              aria-label="Text size"
              value={String(options.fontSize) as (typeof SIZES)[number]}
              onChange={v => set('fontSize', Number(v))}
              options={SIZES.map(size => ({ value: size, label: size }))}
            />
          }
        />
        <SettingsRow
          id="pref-focus"
          label="Focus mode"
          hint="Dims every paragraph but the one you are writing."
          control={<Switch checked={options.focusMode} onCheckedChange={v => set('focusMode', v)} aria-labelledby="pref-focus-label" />}
        />
      </SettingsGroup>

      <SettingsGroup title="Around the page">
        <SettingsRow
          id="pref-outline"
          label="Outline rail"
          hint="The structure of the document beside it, where AI writes sections."
          control={<Switch checked={options.outline} onCheckedChange={v => set('outline', v)} aria-labelledby="pref-outline-label" />}
        />
        <SettingsRow
          id="pref-lines"
          label="Line numbers in Source"
          control={<Switch checked={options.lineNumbers} onCheckedChange={v => set('lineNumbers', v)} aria-labelledby="pref-lines-label" />}
        />
      </SettingsGroup>
    </>
  );
}
