import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Cosmos } from '@/features/home/Cosmos';
import { BrandGlyph } from '@/components/BrandMark';
import { Band, Button, Depth, Grid, IndexEntry, Ledger, SectionHead, Waypoint } from '@/components/ui';
import { SiteFooter } from '@/components/SiteFooter';

export const Route = createFileRoute('/about')({
  component: About,
});

const CONVICTIONS = [
  {
    n: '01',
    title: 'Structure before words',
    body: 'Topical plans the outline before it writes a sentence, so what you get is organised, not one long undifferentiated draft.',
  },
  {
    n: '02',
    title: 'You stay the editor',
    body: 'The model drafts, researches and critiques. Nothing lands in the document without you deciding it should.',
  },
  {
    n: '03',
    title: 'Provenance over plausibility',
    body: 'A sentence that sounds right is not evidence. Every claim should trace back to something a person can check.',
  },
];

const STEPS = [
  { n: '01', title: 'Name the topic', body: 'One line. Topical proposes the whole hierarchy of sections before it writes anything.' },
  { n: '02', title: 'Shape the outline', body: 'Reorder it, rewrite it, cut half of it. Nothing is researched until it is the spine you wanted.' },
  { n: '03', title: 'Write together', body: 'You take the sections that need your judgement; the model researches and drafts the rest, in the same document.' },
  { n: '04', title: 'Verify and ship', body: 'Check every citation, review every change, then publish it or export it as Markdown, MDX or LaTeX.' },
];

const STACK: [string, string][] = [
  ['Interface', 'React, TanStack Router and Query'],
  ['Server', 'FastAPI, SQLAlchemy, Postgres'],
  ['Models', 'Gemini, OpenAI and Anthropic, through LiteLLM'],
  ['Collaboration', 'Yjs, over one WebSocket per document'],
  ['Documents', 'Markdown, MDX and LaTeX'],
];

function About() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="cosmos-page">
      <Cosmos />

      <Band spacing="hero">
        <Depth variant="recede">
          <SectionHead
            level={1}
            size="hero"
            eyebrow={<Waypoint>About</Waypoint>}
            title="Built for the deep end of knowledge work."
            subtitle="Topical is a writing environment where a person and a model work the same document at once. It exists because neither of them, alone, writes the thing worth reading."
          />
        </Depth>
      </Band>

      <Band spacing="voyage">
        <Depth>
          <SectionHead eyebrow={<Waypoint index="01">Convictions</Waypoint>} title="Three things we will not trade away." />
        </Depth>
        <Grid cols={{ base: 1, md: 3 }} gap={6}>
          {CONVICTIONS.map((c, i) => (
            <Depth key={c.n} lag={i * 0.04}>
              <IndexEntry n={c.n} title={c.title}>{c.body}</IndexEntry>
            </Depth>
          ))}
        </Grid>
      </Band>

      <Band spacing="voyage">
        <Depth>
          <SectionHead
            eyebrow={<Waypoint index="02">How it works</Waypoint>}
            title="From one line to a cited document."
            subtitle="Four steps, and you approve every one of them."
          />
        </Depth>
        <Grid cols={{ base: 1, md: 2 }} gap={6}>
          {STEPS.map((s, i) => (
            <Depth key={s.n} variant={i % 2 ? 'swing-end' : 'swing-start'} lag={(i >> 1) * 0.04}>
              <IndexEntry n={s.n} title={s.title}>{s.body}</IndexEntry>
            </Depth>
          ))}
        </Grid>
      </Band>

      <Band spacing="voyage">
        <Depth>
          <SectionHead
            eyebrow={<Waypoint index="03">Built with</Waypoint>}
            title="One frontend, one backend."
            subtitle="A React client and a single FastAPI service that owns accounts, documents, collaboration and generation."
          />
        </Depth>
        <Ledger heads={['Layer', 'What it runs on']} rows={STACK} />
      </Band>

      <Band spacing="voyage">
        <Depth className="arrival">
          <BrandGlyph className="arrival-mark" />
          <h2 className="arrival-title">{isAuthenticated ? 'Back to the work.' : 'Bring a topic.'}</h2>
          <p className="arrival-sub">
            {isAuthenticated
              ? 'Start another document, or read what the community has published.'
              : 'Sign up, add a model key, and have a first draft in a couple of minutes.'}
          </p>
          <Button asChild variant="primary" size="hero">
            <Link to={isAuthenticated ? '/projects' : '/register'}>
              {isAuthenticated ? 'Open your workspace' : 'Start writing'}
              <ArrowRight className="h-[18px] w-[18px]" />
            </Link>
          </Button>
        </Depth>
      </Band>

      <SiteFooter links={[{ to: '/community', label: 'Community' }, { to: '/', label: 'Home' }]} />
    </div>
  );
}
