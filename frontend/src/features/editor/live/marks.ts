import { type Range, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { PeerCaretWidget } from './widgets';

/**
 * Marks the editor screen lays over the text from outside: find results,
 * the section the outline rail is pointing at, a line flashed to show where
 * the caret just went, and collaborators' carets and selections. Each is a
 * state field driven by an effect, so React says what to mark and the
 * editor keeps the marks attached to the text as it changes.
 */

/* ─────────────────────────── Find ─────────────────────────── */

export const setFinds = StateEffect.define<{ matches: { start: number; end: number }[]; current: number }>();

export const findField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setFinds)) continue;
      const { matches, current } = effect.value;
      const size = tr.state.doc.length;
      const out: Range<Decoration>[] = [];
      matches.forEach((m, i) => {
        if (m.end <= m.start || m.end > size) return;
        out.push(Decoration.mark({ class: i === current ? 'cm-find cm-find--current' : 'cm-find' }).range(m.start, m.end));
      });
      value = Decoration.set(out, true);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

/* ─────────────────────────── The section the rail points at ─────────────────────────── */

/** Zero-based source lines, inclusive, or null to clear. */
export const setSection = StateEffect.define<{ from: number; to: number } | null>();

export const sectionField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setSection)) continue;
      const span = effect.value;
      if (!span) { value = Decoration.none; continue; }
      const doc = tr.state.doc;
      const out: Range<Decoration>[] = [];
      const first = Math.min(doc.lines, span.from + 1);
      const last = Math.min(doc.lines, span.to + 1);
      for (let n = first; n <= last; n++) {
        const cls = `cm-section${n === first ? ' cm-section--top' : ''}${n === last ? ' cm-section--end' : ''}`;
        out.push(Decoration.line({ class: cls }).range(doc.line(n).from));
      }
      value = Decoration.set(out);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

/* ─────────────────────────── A line, flashed ─────────────────────────── */

export const flashLine = StateEffect.define<number | null>();

export const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(flashLine)) continue;
      if (effect.value === null) { value = Decoration.none; continue; }
      const line = tr.state.doc.lineAt(Math.min(effect.value, tr.state.doc.length));
      value = Decoration.set([Decoration.line({ class: 'cm-flash' }).range(line.from)]);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

/* ─────────────────────────── Collaborators ─────────────────────────── */

export interface PeerMark { id: number; name: string; color: string; index: number; length: number }

export const setPeers = StateEffect.define<PeerMark[]>();

export const peerField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setPeers)) continue;
      const size = tr.state.doc.length;
      const out: Range<Decoration>[] = [];
      for (const peer of effect.value) {
        const at = Math.max(0, Math.min(peer.index, size));
        const end = Math.max(at, Math.min(peer.index + peer.length, size));
        if (end > at) {
          out.push(Decoration.mark({ class: 'cm-peer-selection', attributes: { style: `--peer: ${peer.color}` } }).range(at, end));
        }
        out.push(Decoration.widget({ widget: new PeerCaretWidget(peer.name, peer.color), side: 1 }).range(end));
      }
      value = Decoration.set(out, true);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

export const editorMarks = [findField, sectionField, flashField, peerField];
