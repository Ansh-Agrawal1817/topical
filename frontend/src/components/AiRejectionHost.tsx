import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Copy, Settings2, ShieldAlert } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui';
import { dismissRejection, onRejection, type RejectionKind, type RejectionReport } from '@/lib/aiRejection';

const TITLE: Record<RejectionKind, (r: RejectionReport) => string> = {
  auth: r => `${r.provider} rejected your API key`,
  access: r => `Your ${r.provider} key can’t use ${r.model}`,
  model: r => `${r.provider} has no model called ${r.model}`,
  'too-long': r => `Too long for ${r.model}`,
  policy: r => `${r.provider} declined this request`,
  'bad-request': r => `${r.provider} rejected the request`,
};

const STEPS: Record<RejectionKind, string[]> = {
  auth: [
    'Open Settings → Models and paste the key again — copied whole, with no spaces.',
    'Check the key has not been revoked or expired in the provider’s dashboard.',
    'Or switch to another saved model.',
  ],
  access: [
    'Pick a model your plan includes, in Settings → Models.',
    'Some models need billing turned on, or a separate request for access, at the provider.',
  ],
  model: [
    'The model may have been renamed or retired. Choose another in Settings → Models — the list there is read live from the provider.',
  ],
  'too-long': [
    'Write or refine a smaller part: one section, or a shorter selection.',
    'Or choose a model with a larger context window.',
  ],
  policy: [
    'Rephrase the instruction, or try a different passage.',
    'Another provider may answer where this one will not.',
  ],
  'bad-request': [
    'Try again — a malformed answer is sometimes a one-off.',
    'If it keeps happening, pick another model in Settings → Models; this one may not support what was asked.',
  ],
};

/** Kinds fixed in Settings, where the dialog's main button goes. */
const IN_SETTINGS: ReadonlySet<RejectionKind> = new Set(['auth', 'access', 'model', 'bad-request']);

/**
 * The AI provider refused a request: a centred dialog saying who refused,
 * in their own words, and what to do about it. See `lib/aiRejection`.
 */
export function AiRejectionHost() {
  const [report, setReport] = useState<RejectionReport | null>(null);
  useEffect(() => onRejection(setReport), []);

  // Kept while the dialog animates closed, so its text does not blank out.
  const [shown, setShown] = useState<RejectionReport | null>(null);
  useEffect(() => { if (report) setShown(report); }, [report]);
  const r = report ?? shown;

  const copy = () => {
    if (!r) return;
    const text = `${TITLE[r.kind](r)}\nProvider: ${r.provider}\nModel: ${r.model}\n${r.message}\n${r.reason ? `Provider said: ${r.reason}` : ''}`;
    navigator.clipboard.writeText(text.trim()).then(() => toast.success('Details copied')).catch(() => {});
  };

  return (
    <Dialog open={report !== null} onOpenChange={open => { if (!open) dismissRejection(); }}>
      <DialogContent material="solid" size="lg" className="rejection-dialog">
        {r && (
          <>
            <div className="rejection-head">
              <span className="rejection-icon" aria-hidden="true"><ShieldAlert className="h-6 w-6" /></span>
              <div className="min-w-0">
                <DialogTitle className="rejection-title">{TITLE[r.kind](r)}</DialogTitle>
                <DialogDescription className="rejection-message">{r.message}</DialogDescription>
              </div>
            </div>

            <dl className="rejection-facts">
              <div><dt>Provider</dt><dd>{r.provider}</dd></div>
              {r.model && <div><dt>Model</dt><dd className="rejection-mono">{r.model}</dd></div>}
              {r.count > 1 && <div><dt>Requests refused</dt><dd>{r.count}</dd></div>}
              {r.stopped > 0 && <div><dt>Stopped in the queue</dt><dd>{r.stopped} — they would have failed the same way</dd></div>}
            </dl>

            {r.reason && (
              <figure className="rejection-quote">
                <figcaption>What {r.provider} said</figcaption>
                <blockquote>{r.reason}</blockquote>
              </figure>
            )}

            <div className="rejection-steps">
              <div className="rejection-steps-title">What to do</div>
              <ol>{STEPS[r.kind].map(step => <li key={step}>{step}</li>)}</ol>
            </div>

            <footer className="rejection-actions">
              <Button variant="ghost" size="md" onClick={copy}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy details
              </Button>
              <span className="flex-1" />
              <Button variant={IN_SETTINGS.has(r.kind) ? 'secondary' : 'primary'} size="md" onClick={dismissRejection}>Close</Button>
              {IN_SETTINGS.has(r.kind) && (
                <Button asChild variant="primary" size="md">
                  <Link to="/settings" search={{ section: 'models' }} onClick={dismissRejection}>
                    <Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> Open model settings
                  </Link>
                </Button>
              )}
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
