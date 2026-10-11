import { useCallback, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { IconButton, MenuLabel, MenuPanel } from '@/components/ui';
import { useDismiss } from '@/hooks/useDismiss';
import { DOC_ACCENTS, DOC_FONTS, DOC_THEMES, type DocStyle } from '../lib/docStyle';

/**
 * Document style: the page, its accent colour and its typeface — this
 * document only. Opened from the header, in writing and in read mode alike.
 */
export function DocStyleMenu({ style, onChange }: { style: DocStyle; onChange: (patch: Partial<DocStyle>) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(close);

  return (
    <div className="editor-menu-wrap doc-style" ref={ref}>
      <IconButton size="lg" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog"
        title="Document style — page, colour and font" aria-label="Document style">
        <Palette className="h-4 w-4" />
      </IconButton>
      {open && (
        <MenuPanel origin="top-right" className="editor-menu doc-style-panel" role="dialog" aria-label="Document style">
          <DocStyleControls style={style} onChange={onChange} />
        </MenuPanel>
      )}
    </div>
  );
}

/**
 * The choices themselves, without a trigger — the header's popover holds
 * them, and on a narrow screen the view menu does, where the palette button
 * would otherwise cost the document's title another 40px of a 375px bar.
 */
export function DocStyleControls({ style, onChange }: { style: DocStyle; onChange: (patch: Partial<DocStyle>) => void }) {
  return (
    <>
      <MenuLabel>Page</MenuLabel>
      <div className="doc-style-row" role="radiogroup" aria-label="Page">
        {DOC_THEMES.map(theme => (
          <button key={theme.value} type="button" role="radio" aria-checked={style.theme === theme.value}
            className="doc-style-page" data-on={style.theme === theme.value} onClick={() => onChange({ theme: theme.value })}
            title={theme.label}>
            <span className="doc-style-page-swatch" style={{ background: theme.swatch, color: theme.ink }}>Aa</span>
            <span>{theme.label}</span>
          </button>
        ))}
      </div>

      <MenuLabel>Accent</MenuLabel>
      <div className="doc-style-row" role="radiogroup" aria-label="Accent colour">
        {DOC_ACCENTS.map(accent => (
          <button key={accent.value} type="button" role="radio" aria-checked={style.accent === accent.value}
            className="doc-style-dot" data-on={style.accent === accent.value} onClick={() => onChange({ accent: accent.value })}
            title={accent.label} aria-label={accent.label} style={{ background: accent.swatch }}>
            {style.accent === accent.value && <Check className="h-3 w-3" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <MenuLabel>Font</MenuLabel>
      <div className="doc-style-fonts" role="radiogroup" aria-label="Font">
        {DOC_FONTS.map(font => (
          <button key={font.value} type="button" role="radio" aria-checked={style.font === font.value}
            className="doc-style-font" data-on={style.font === font.value} onClick={() => onChange({ font: font.value })}>
            <span style={{ fontFamily: font.family }}>Ag</span>
            <span>{font.label}</span>
          </button>
        ))}
      </div>
      <p className="doc-style-note">This document only. Export PDF starts from these too.</p>
    </>
  );
}
