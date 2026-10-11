import { useState } from 'react';
import {
  ArrowLeft, Copy, Download, FileCode, FileDown, Printer, Redo2, Save,
  Settings2, Undo2, ListTree, Check, Sun, Moon, Link2, PenLine, BookOpen, AlertTriangle,
} from 'lucide-react';
import { Button, Chip, IconButton, Spinner, Input, Segmented, MenuItem, MenuLabel, MenuPanel } from '@/components/ui';
import type { DocFormat } from '@/lib/types';
import { SOURCE_EXTENSION } from '../lib/exporters';
import { Collaborators } from '@/components/Collaborators';
import type { AiCollaborator } from '@/lib/types';
import type { ReviewerStatus } from '../ai/reviewers';
import { AiCollaboratorsButton } from './AiCollaboratorsButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { setTheme, useTheme } from '@/lib/theme';
import type { AwarenessCursor } from '@/hooks/useYjsCollab';
import { useDismiss } from '@/hooks/useDismiss';
import type { SurfaceMode, ViewOptions } from '../lib/viewOptions';
import type { DocStyle } from '../lib/docStyle';
import type { SaveState } from '../hooks/useDocument';
import { DocStyleControls, DocStyleMenu } from './DocStyleMenu';

interface Props {
  name: string;
  /** The document's markup, shown as a chip beside its name. */
  format: DocFormat;
  onRename: (name: string) => void;
  authorUsername: string | null;
  coAuthorUsernames: (string | null)[];
  isAuthor: boolean;
  onManageCoAuthors: () => void;
  /** AI models on the document as reviewers, and what each is doing. */
  aiCollaborators: AiCollaborator[];
  aiStatuses: Record<string, ReviewerStatus>;
  onOpenReview: () => void;
  /** Owner only: change the AI collaborators. */
  onAiChange?: (next: AiCollaborator[]) => void;
  myId?: string;
  aiPopOpen: boolean;
  onAiPopOpen: (open: boolean) => void;
  suggestions: number;
  peers: AwarenessCursor[];
  /** Where the document's save stands — the button mirrors it. */
  saveState: SaveState;
  onSave: () => void;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Live (the document as it reads) or source (the plain text). */
  surface: SurfaceMode;
  onSurface: (mode: SurfaceMode) => void;
  /** One-pane layout: the bar drops everything that is not load-bearing. */
  compact?: boolean;
  /** Whether the writing surface is live, or this is read mode. */
  editing: boolean;
  /** Switch between reading and writing in place. Absent for a viewer who may only read. */
  onMode?: (mode: 'read' | 'write') => void;
  options: ViewOptions;
  onOptions: (next: Partial<ViewOptions>) => void;
  onExport: (kind: 'link' | 'source' | 'copy' | 'print' | 'pdf') => void;
  /** This document's page, accent and font. */
  docStyle: DocStyle;
  onDocStyle: (patch: Partial<DocStyle>) => void;
}

type ViewMode = 'read' | SurfaceMode;

/* Autosave keeps the button's state moving on its own; the words stay short
   and the button holds one width (editor.css), so the bar does not twitch
   every time a save lands. */
const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved', dirty: 'Save', saving: 'Saving', error: 'Retry save',
};

/* Read is a mode of this screen, beside the two ways of writing — not a
   separate page you leave the editor for. */
const VIEWS: { mode: ViewMode; icon: typeof PenLine; label: string; title: string }[] = [
  { mode: 'read', icon: BookOpen, label: 'Read', title: 'Read — the finished, typeset document' },
  { mode: 'live', icon: PenLine, label: 'Live', title: 'Live — the document as it reads, markup shown where the caret is' },
  { mode: 'source', icon: FileCode, label: 'Source', title: 'Source — the plain text, all its markup' },
];

export function EditorHeader(props: Props) {
  const [menu, setMenu] = useState<'none' | 'view' | 'export'>('none');
  const theme = useTheme();
  const menuRef = useDismiss(() => setMenu('none'));

  const {
    name, format, onRename, authorUsername, coAuthorUsernames, isAuthor, onManageCoAuthors,
    aiCollaborators, aiStatuses, onOpenReview, onAiChange, myId, aiPopOpen, onAiPopOpen, suggestions,
    peers, saveState, onSave, onBack, onUndo, onRedo,
    surface, onSurface, options, onOptions, onExport, compact, editing, onMode, docStyle, onDocStyle,
  } = props;

  /* Declared once because they appear in one of two places: their own menu
     when there is room for a third header button, and inside the view menu
     when there is not. */
  const exportItems = (
    <>
      {/* The two files the download button exists for, first and named by
          what they are: the typeset PDF, or the source in its own format. */}
      <MenuLabel>Download</MenuLabel>
      <MenuItem icon={<FileDown className="h-3.5 w-3.5" />} trailing={<span className="editor-menu-ext">.pdf</span>}
        onClick={() => { onExport('pdf'); setMenu('none'); }}>
        PDF document…
      </MenuItem>
      <MenuItem icon={<FileCode className="h-3.5 w-3.5" />} trailing={<span className="editor-menu-ext">.{SOURCE_EXTENSION[format]}</span>}
        onClick={() => { onExport('source'); setMenu('none'); }}>
        {format === 'latex' ? 'LaTeX source' : 'MDX source'}
      </MenuItem>
      <MenuLabel>Share</MenuLabel>
      <MenuItem icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => { onExport('link'); setMenu('none'); }}>
        Copy link
      </MenuItem>
      <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onClick={() => { onExport('copy'); setMenu('none'); }}>
        Copy source to clipboard
      </MenuItem>
      <MenuItem icon={<Printer className="h-3.5 w-3.5" />} onClick={() => { onExport('print'); setMenu('none'); }}>
        Print
      </MenuItem>
    </>
  );

  const aiButton = editing && (
    <AiCollaboratorsButton
      collaborators={aiCollaborators}
      statuses={aiStatuses}
      onChange={onAiChange}
      myId={myId}
      open={aiPopOpen}
      onOpenChange={onAiPopOpen}
      onOpenReview={onOpenReview}
      suggestions={suggestions}
    />
  );

  return (
    <header className="editor-header">
      {/* Out to the projects list. Reading and writing are modes of this one
          screen, switched in place below, so "back" always means leaving it. */}
      <IconButton onClick={onBack} title="Back" aria-label="Back">
        <ArrowLeft className="h-4 w-4" />
      </IconButton>

      {/* An input you cannot type into is a lie about what it is: reading gets
          the name as a heading, which is also what it is semantically. */}
      {editing ? (
        <Input
          variant="bare"
          className="editor-title"
          value={name}
          onChange={event => onRename(event.target.value)}
          aria-label="Document title"
          spellCheck={false}
        />
      ) : (
        <h1 className="editor-title editor-title--static">{name}</h1>
      )}

      {/* What the document is written in, beside what it is called. */}
      <Chip tone={format === 'latex' ? 'latex' : 'accent'} mono size="xs" className="editor-format"
        title={format === 'latex' ? 'Written in LaTeX' : 'Written in MDX (Markdown)'}>
        {format === 'latex' ? 'LaTeX' : 'MDX'}
      </Chip>

      {/* The byline is prose about the document; the collaborator control is
          the part you act on. Narrow, only the second survives — a bar with
          six things in 375px has no room for "by realaryan". */}
      {compact ? (
        <>
          <Collaborators
            authorUsername={authorUsername}
            coAuthorUsernames={coAuthorUsernames}
            onManage={isAuthor ? onManageCoAuthors : undefined}
          />
          {aiButton}
        </>
      ) : (
        <div className="editor-byline">
          <span className="editor-byline-label">by</span>
          {/* "you" only when you actually are the owner. This read
              `authorUsername || 'you'` — so a document whose owner has not set
              a handle was announced as yours to every co-author on it. */}
          <span className="editor-byline-name">{authorUsername || (isAuthor ? 'you' : 'a member')}</span>
          {/* The count opens the names, and managing them is offered from inside
              that list rather than as a second button beside it. */}
          <Collaborators
            authorUsername={authorUsername}
            coAuthorUsernames={coAuthorUsernames}
            onManage={isAuthor ? onManageCoAuthors : undefined}
          />
          {/* The AI collaborators, beside the people: add one, set them up, see what they suggest. */}
          {aiButton}
        </div>
      )}

      {editing && !compact && peers.length > 0 && (
        <div className="editor-peers">
          {peers.slice(0, 4).map(peer => (
            <span
              key={peer.clientId}
              className="editor-peer"
              title={`${peer.user.name} is editing`}
              style={{ background: peer.user.color, boxShadow: `0 0 10px ${peer.user.color}55` }}
            >
              {peer.user.name[0]?.toUpperCase()}
            </span>
          ))}
          {peers.length > 4 && <span className="editor-peer editor-peer--more">+{peers.length - 4}</span>}
        </div>
      )}

      {/* The spacer pushes the controls right when there is slack to push
          into. Narrow, there is none — and as a flex item it competed with the
          title for it, which is why the document name came out as "S..". The
          title grows into the gap instead. */}
      {!compact && <div className="flex-1" />}

      {/* Undo and redo keep their keyboard bindings either way; on a narrow
          bar they are the two controls whose absence costs least. */}
      {editing && !compact && (
        <>
          <IconButton size="lg" onClick={onUndo} title="Undo  ⌘Z" aria-label="Undo">
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton size="lg" onClick={onRedo} title="Redo  ⌘⇧Z" aria-label="Redo">
            <Redo2 className="h-4 w-4" />
          </IconButton>
        </>
      )}

      {/* Read, Live or Source — for anyone who may write. A reader has one
          view and no switch: a one-option control is a label pretending to
          be a choice. */}
      {onMode && (
        <Segmented<ViewMode>
          size="sm"
          iconOnly={compact}
          className="ml-1"
          aria-label="View"
          value={editing ? surface : 'read'}
          onChange={next => {
            if (next === 'read') { onMode('read'); return; }
            onSurface(next);
            if (!editing) onMode('write');
          }}
          options={VIEWS.map(view => ({
            value: view.mode,
            label: view.label,
            icon: <view.icon className="h-3.5 w-3.5" />,
            title: view.title,
            'aria-label': view.label,
          }))}
        />
      )}

      {/* ── Three controls, or one ──
          Wide, the theme switch, the view options and the export menu each get
          their own button. Narrow, they collapse into the view menu: at 375px
          those three cost 114px of a bar that also has to hold the document's
          name, and the name was being squeezed to two characters to pay for
          them. Nothing is dropped — the export actions move inside, and the
          theme becomes a row rather than a switch. */}
      <div className="editor-menus" ref={menuRef}>
        {!compact && <DocStyleMenu style={docStyle} onChange={onDocStyle} />}
        {!compact && <ThemeToggle />}

        <div className="editor-menu-wrap">
          <IconButton
            size="lg"
            active={menu === 'view'}
            onClick={() => setMenu(menu === 'view' ? 'none' : 'view')}
            title="View options"
            aria-label="View options"
          >
            <Settings2 className="h-4 w-4" />
          </IconButton>

          {menu === 'view' && (
            <MenuPanel origin="top-right" className={compact ? 'editor-menu editor-menu--compact' : 'editor-menu'}>
              {/* Every one of these is about the writing surface — a rail you
                  edit structure in, numbers on source lines, a focus band
                  around the caret. None of them has anything to act on while
                  reading. */}
              {editing && (
                <>
                  <MenuLabel>Layout</MenuLabel>
                  <MenuToggle label="Outline rail" icon={ListTree} on={options.outline} onClick={() => onOptions({ outline: !options.outline })} />
                  <MenuToggle label="Focus mode" on={options.focusMode} onClick={() => onOptions({ focusMode: !options.focusMode })} />
                  {options.surface === 'source' && (
                    <MenuToggle label="Line numbers" on={options.lineNumbers} onClick={() => onOptions({ lineNumbers: !options.lineNumbers })} />
                  )}
                </>
              )}

              <MenuLabel>Text size</MenuLabel>
              <div className="editor-menu-row">
                <Button variant="secondary" size="md" aria-label="Smaller text" onClick={() => onOptions({ fontSize: Math.max(12, options.fontSize - 1) })}>−</Button>
                <span className="editor-menu-value">{options.fontSize}px</span>
                <Button variant="secondary" size="md" aria-label="Larger text" onClick={() => onOptions({ fontSize: Math.min(24, options.fontSize + 1) })}>+</Button>
              </div>

              {compact && (
                <>
                  <MenuItem
                    icon={theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                    onClick={event => {
                      // The theme wipe grows from whatever was pressed, so it
                      // needs this row's position, not the switch's.
                      const box = event.currentTarget.getBoundingClientRect();
                      setTheme(theme === 'dark' ? 'light' : 'dark', {
                        x: box.left + box.width / 2,
                        y: box.top + box.height / 2,
                      });
                      setMenu('none');
                    }}
                  >
                    {theme === 'dark' ? 'Light theme' : 'Dark theme'}
                  </MenuItem>

                  <MenuLabel>Export</MenuLabel>
                  {exportItems}

                  <div className="editor-menu-section">
                    <DocStyleControls style={docStyle} onChange={onDocStyle} />
                  </div>
                </>
              )}
            </MenuPanel>
          )}
        </div>

        {!compact && (
          <div className="editor-menu-wrap">
            <IconButton
              size="lg"
              active={menu === 'export'}
              onClick={() => setMenu(menu === 'export' ? 'none' : 'export')}
              title="Download and share"
              aria-label="Download and share"
            >
              <Download className="h-4 w-4" />
            </IconButton>

            {menu === 'export' && <MenuPanel origin="top-right" className="editor-menu">{exportItems}</MenuPanel>}
          </div>
        )}
      </div>

      {/* Writing offers the one control that commits it; read mode has
          nothing to save. Compact drops the word, not the state — the icon
          still distinguishes saving from saved, and the accessible name still
          says which. Secondary: the document autosaves, and the outline
          rail's "Write sections" is the view's primary action. */}
      {editing && (
        <Button
          variant="secondary"
          size="md"
          density={compact ? 'tight' : 'default'}
          className="editor-save"
          data-state={saveState}
          onClick={onSave}
          title={`${SAVE_LABEL[saveState]}  ⌘S`}
          aria-label={SAVE_LABEL[saveState]}
        >
          {saveState === 'saving' ? <Spinner size="sm" />
            : saveState === 'error' ? <AlertTriangle className="h-3.5 w-3.5" />
            : saveState === 'saved' ? <Check className="h-3.5 w-3.5" />
            : <Save className="h-3.5 w-3.5" />}
          {!compact && SAVE_LABEL[saveState]}
        </Button>
      )}
    </header>
  );
}

function MenuToggle({ label, icon: Icon, on, onClick }: {
  label: string;
  icon?: typeof ListTree;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <MenuItem
      checked={on}
      onClick={onClick}
      role="menuitemcheckbox"
      aria-checked={on}
      icon={Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="editor-menu-spacer" />}
      trailing={on ? <Check className="h-3.5 w-3.5" /> : undefined}
    >
      {label}
    </MenuItem>
  );
}
