import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '@/lib/auth-context';
import { Voyage } from '@/features/home/voyage/Voyage';
import {
  ArrivalChapter, ContextChapter, EarthChapter, HeroChapter, HistoryChapter, MilkyWayChapter, ProvenanceChapter, SystemChapter, Trail,
} from '@/features/home/voyage/chapters';
import { SiteFooter } from '@/components/SiteFooter';

export const Route = createFileRoute('/')({
  beforeLoad: () => ({}),
  component: Home,
});

/**
 * The landing page is one voyage down a topic and back out
 * (features/home/voyage), and the scene is the demonstration — every
 * feature on the roadmap, each where it fits:
 *
 *   the galaxy          — Topical: human minds and AI, working as one
 *   01 The Milky Way    — a topic, its outline, the pulls that keep it consistent
 *   02 The Solar System — any part opens up, with context; the critic finds gaps
 *   03 Earth            — written together, section by section; edits accepted; claims sourced
 *   04 Earth's orbit    — your sources, the context each task draws, work done in the background
 *   05 A meteor shower  — provenance: every claim traced back to where it began
 *   06 The Moon's orbit — versions and branches; one document, every format
 *   the Earth, centred  — so, what's the topic?
 */
function Home() {
  const { isAuthenticated } = useAuth();
  const startHref = isAuthenticated ? '/projects' : '/register';
  const startLabel = isAuthenticated ? 'Open Topical' : 'Start free';

  return (
    <div className="voyage-page">
      <Voyage>
        <HeroChapter />
        <Trail />
        <MilkyWayChapter />
        <SystemChapter />
        <EarthChapter />
        <ContextChapter />
        <ProvenanceChapter />
        <HistoryChapter />
        <ArrivalChapter startHref={startHref} startLabel={startLabel} />
        {/* The footer is part of the last screen, so the page ends where the voyage does. */}
        <SiteFooter
          links={[{ to: '/community', label: 'Community' }, { to: '/about', label: 'About' }]}
          className="v-footer"
          data-chapter="arrival"
        />
      </Voyage>
    </div>
  );
}
