import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button, Input, TextLink, Waypoint } from '@/components/ui'
import { BrandMark } from '@/components/BrandMark'
import { Anchor } from './Anchor'
import { useChapterClock, voyage } from './store'
import {
  BRANCH, CONTEXT_LOOP, CONTEXT_SOURCES, CONTEXT_TASKS, EARTH_LOOP, EARTH_PARTS, FORMATS, GALAXY_ITEMS, MILKY_WAY_TURN, PROBES,
  SHOWER, SHOWER_LOOP, SHOWER_NAMES, TOPIC_ROOT, VERSIONS,
} from './content'
import { earthStates, loopClock, partAt, partProgress, sectionAt, sectionProgress, SOLAR, tree, type PartState } from './tree'
import {
  branchShown, claimAt, OUTLINE, probeAt, rayDrawn, rayEnd, showerShown, showerState, sourceAt,
  sourceProgress, sourceSeen, strayAt, taskAt, underMoon, versionShown,
} from './earthside'
import { AU, moonAt, SUN, SYSTEM_RADIUS } from './solar'
import { add, polar, smooth } from '../scene/kit'

/**
 * The voyage's chapters: what is said at each stop. Each panel is a real
 * section of the page — its heading and its words are for everyone,
 * assistive tech included. What Topical does is shown, not mocked up: the
 * scene under the words is the demonstration — a topic coming apart into
 * its parts, a part opening into a topic of its own, a subtopic's parts
 * being written — and the labels pinned to it are decoration.
 */

/** A value read from the voyage a few times a second, for React to show. */
function useSampled<T extends string | number | boolean>(read: () => T, hz = 10): T {
  const [value, setValue] = useState(read)
  const live = useRef(read)
  live.current = read
  useEffect(() => {
    const id = window.setInterval(() => setValue(live.current()), 1000 / hz)
    return () => window.clearInterval(id)
  }, [hz])
  return value
}

function ChapterHead({ n, kicker, title }: { n: string; kicker: string; title: string }) {
  return (
    <header className="v-head">
      <Waypoint index={n}>{kicker}</Waypoint>
      <h2 className="v-title">{title}</h2>
    </header>
  )
}

/* ─────────────────────────── Hero ─────────────────────────── */

export function HeroChapter() {
  return (
    <section data-chapter="hero" className="v-hero">
      <h1 className="v-hero-mark">
        <BrandMark size="hero" alive />
      </h1>
      <p className="v-hero-line">
        Where human minds and artificial intelligence <em className="hero-mark">work as one</em>
      </p>
    </section>
  )
}

/* ─────────────────────────── Where you are ─────────────────────────── */

const SPUR = GALAXY_ITEMS[SOLAR.section].name

/** Each stretch of the scroll, what it is, and the way down to it. */
const EARTH_PATH = ['The Milky Way', SPUR, 'The Solar System', 'Earth']
const LEGS: { from: number; level: string; path: string[] }[] = [
  { from: 0.05, level: 'Topic', path: ['The Milky Way'] },
  { from: 0.245, level: 'Subtopic', path: ['The Milky Way', SPUR, 'The Solar System'] },
  { from: 0.43, level: 'Subtopic', path: EARTH_PATH },
  { from: 0.59, level: 'Context', path: EARTH_PATH },
  { from: 0.72, level: 'Provenance', path: EARTH_PATH },
  { from: 0.845, level: 'History', path: [...EARTH_PATH, 'The Moon'] },
]
const TRAIL_END = 0.935

/**
 * The label for the stretch of the voyage the camera is in: whether it is
 * the topic or a subtopic, and the way down to it from the top. A crumb is
 * added each time the camera goes a level deeper.
 */
export function Trail() {
  const leg = useSampled(() => {
    const p = voyage.p
    if (p < LEGS[0].from || p >= TRAIL_END) return -1
    let i = 0
    while (i + 1 < LEGS.length && p >= LEGS[i + 1].from) i++
    return i
  })
  const shown = LEGS[Math.max(0, leg)]
  return (
    <div className="v-trail" data-shown={leg >= 0} aria-hidden="true">
      <span key={shown.level} className="v-trail-level">{shown.level}</span>
      <ol className="v-trail-path">
        {shown.path.map((name, i) => (
          <li key={name} data-current={i === shown.path.length - 1}>{name}</li>
        ))}
      </ol>
    </div>
  )
}

/* ─────────────────────────── 01 · The topic ─────────────────────────── */

/**
 * Where the Solar System's name sits: just below the system, on the side
 * nearest the camera, so it clears the orbits at any size the system is
 * drawn. (Bearing 270° on screen at the chapter's turn of the galaxy.)
 */
const SOLAR_LABEL = add(SUN, polar(270 - (MILKY_WAY_TURN * 180) / Math.PI, (SYSTEM_RADIUS + 0.5) * AU))

export function MilkyWayChapter() {
  // Each paragraph arrives with the stage of the scene it describes.
  const stage = useSampled(() => (tree.whole > 0 ? 3 : tree.links > 0 ? 2 : tree.split > 0 ? 1 : 0))

  return (
    <>
      <section data-chapter="milkyway" className="v-panel">
        <ChapterHead n="01" kicker="The nature of a topic" title="A topic is never one thing." />
        <div className="v-essay">
          <p data-on={stage >= 1}>
            Look closely at any subject and it comes apart into parts, and every part into smaller
            ones.
          </p>
          <p data-on={stage >= 2}>
            None of them stands alone. Each leans on the others, so changing one part can quietly
            change what another one means.
          </p>
          <p data-on={stage >= 3}>
            Topical maps a topic the way it really is: an outline shaped to your goal and your
            reader, with every term and argument kept consistent as the parts change.
          </p>
        </div>
      </section>

      <Anchor space="galaxy" point={() => TOPIC_ROOT} chapters={['milkyway']} align="above" shown={() => tree.root}>
        <span className="v-mark v-mark--root">The Milky Way</span>
      </Anchor>
      {GALAXY_ITEMS.map((item, i) => (
        <Anchor
          key={item.id}
          space="galaxy"
          point={() => sectionAt(i)}
          chapters={['milkyway']}
          align={item.align}
          shown={() => smooth(0.55, 1, sectionProgress(i))}
        >
          <span className="v-mark v-mark--section">{item.name}</span>
        </Anchor>
      ))}
      {GALAXY_ITEMS.flatMap((item, i) => item.parts.map((part, j) => {
        const solar = i === SOLAR.section && j === SOLAR.part
        return (
          <Anchor
            key={`${item.id}-${j}`}
            space="galaxy"
            point={() => (solar ? SOLAR_LABEL : partAt(i, j))}
            // The Solar System's name stays with it after the chapter has gone,
            // while the camera crosses to it.
            chapters={solar ? [] : ['milkyway']}
            align={part.align}
            shown={() => smooth(0.55, 1, partProgress(i, j)) * (solar ? 1 - smooth(0.27, 0.3, voyage.p) : 1)}
          >
            <span className="v-mark v-mark--part" data-keep={solar || undefined}>{part.name}</span>
          </Anchor>
        )
      }))}
    </>
  )
}

/* ─────────────────────────── 02 · A subtopic ─────────────────────────── */

export function SystemChapter() {
  return (
    <section data-chapter="system" className="v-panel">
      <ChapterHead n="02" kicker="Going deeper" title="Any part can become the topic." />
      <div className="v-essay">
        <p data-on>
          Open any part and it becomes a topic of its own, with its own outline. Topical carries
          down only what still matters from above, so the detail never loses the bigger picture.
        </p>
        <p data-on>
          Then it reads the whole like a critic. It spots the part that doesn’t add up, works out
          what must be missing, and shows you the gap, the weak argument or the contradiction before
          your reader finds it.
        </p>
      </div>
    </section>
  )
}

/* ─────────────────────────── 03 · Another, written ─────────────────────────── */

/** What a row of the outline says about its part, in each state. */
function partStatus(part: (typeof EARTH_PARTS)[number], state: PartState): string {
  switch (state) {
    case 'queued': return 'waiting'
    case 'writing': return part.who === 'ai' ? 'AI is drafting' : 'you’re writing'
    case 'review': return 'AI suggests an edit'
    case 'flagged': return '1 claim needs a source'
    case 'done': return part.review ? '✓ edit accepted' : part.flag ? '✓ sourced' : '✓ written'
  }
}

export function EarthChapter() {
  const t = useChapterClock('earth')
  const loop = t == null ? null : voyage.reduced ? EARTH_LOOP - 1.4 : t % EARTH_LOOP
  const states = earthStates(loop)

  return (
    <>
      <section data-chapter="earth" className="v-panel">
        <ChapterHead n="03" kicker="Writing it" title="Written together, and sourced." />
        <div className="v-essay">
          <p data-on>
            You and the AI work on the same document at once. It drafts, expands or rewrites any
            section in the light of the whole, and leaves you the parts that need you.
          </p>
          <p data-on>
            Nothing it changes lands without your yes, and nothing settles until it can be traced:
            a claim without a source waits, flagged.
          </p>
        </div>
      </section>

      {/* The subtopic's outline, beside the planet its parts are written on. */}
      <Anchor space="earth" point={() => [OUTLINE.x, 0]} chapters={['earth']} align="right" shown={() => tree.earth}>
        <ol className="v-outline" aria-label="Earth’s parts, as they are written">
          {EARTH_PARTS.map((part, i) => {
            const { state } = states[i]
            const who = state === 'review' ? 'ai' : part.who
            return (
              <li key={part.name} className="v-outline-row" data-state={state} data-who={who}>
                <span className="v-outline-n">{i + 1}</span>
                <span className="v-outline-body">
                  <span className="v-outline-name">
                    {part.name}
                    {(state === 'writing' || state === 'review') && (
                      <span className="v-outline-who">{who === 'ai' ? 'AI' : 'You'}</span>
                    )}
                  </span>
                  <span className="v-outline-status">{partStatus(part, state)}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </Anchor>
    </>
  )
}

/* ─────────────────────────── 04 · Context ─────────────────────────── */

export function ContextChapter() {
  const t = useChapterClock('context')
  const loop = t == null ? 0 : voyage.reduced ? CONTEXT_LOOP - 0.2 : t % CONTEXT_LOOP
  const task = CONTEXT_TASKS[taskAt(loop)]

  return (
    <>
      <section data-chapter="context" className="v-panel">
        <ChapterHead n="04" kicker="Your sources" title="Everything you trust, close at hand." />
        <div className="v-essay">
          <p data-on>
            Bring in the papers, pages and notes you trust. For each task Topical draws in only what
            that task needs, condensed, and leaves the rest alone until it is needed.
          </p>
          <p data-on>
            Hand it the slow work, like research, a fact-check or a full review. It goes off and
            comes back while you keep writing.
          </p>
        </div>
      </section>

      {CONTEXT_SOURCES.map((source, i) => (
        <Anchor
          key={source.name}
          space="galaxy"
          point={() => sourceAt(i, voyage.time)}
          chapters={['context']}
          align="right"
          shown={() => sourceSeen[i] * smooth(0.6, 1, sourceProgress(i))}
        >
          <span className="v-mark v-mark--source" data-used={task.uses.includes(i)}>{source.name}</span>
        </Anchor>
      ))}
      {PROBES.map((probe, i) => {
        const trip = probeAt(i, loop)
        return (
          <Anchor
            key={probe.label}
            space="earth"
            point={() => probeAt(i, loopClock('context', CONTEXT_LOOP) ?? 0)?.at ?? null}
            chapters={['context']}
            align="above"
          >
            <span className="v-mark v-mark--probe" data-back={!!trip?.back}>
              {trip?.back ? `back · ${probe.back}` : `${probe.label}…`}
            </span>
          </Anchor>
        )
      })}
      <Anchor space="earth" point={() => [0, 1.18]} chapters={['context']} align="below" shown={() => tree.context}>
        <span className="v-mark v-mark--task">
          {task.label}
          <span className="v-mark-status">{task.uses.length} of {CONTEXT_SOURCES.length} sources · {task.from}k → {task.to}k tokens</span>
        </span>
      </Anchor>
    </>
  )
}

/* ─────────────────────────── 05 · Provenance ─────────────────────────── */

export function ProvenanceChapter() {
  const t = useChapterClock('provenance')
  const loop = t == null ? null : voyage.reduced ? SHOWER_LOOP - 1.4 : t % SHOWER_LOOP
  const st = showerState(loop)
  // The labels go with the demonstration when it fades out to start over.
  const live = () => showerShown() * showerState(loopClock('provenance', SHOWER_LOOP)).alpha
  const marks: { id: string; at: () => number[]; align: 'right' | 'above' | 'left'; on: boolean; name: string; note: string }[] = [
    { id: 'claims', at: () => claimAt(SHOWER.claims.length - 1), align: 'right', on: st.fall(SHOWER.claims.length - 1) >= 1, name: SHOWER_NAMES.claims, note: st.trusted ? '✓ traced to a primary source' : '' },
    { id: 'radiant', at: () => SHOWER.radiant, align: 'right', on: st.radiantFound, name: SHOWER_NAMES.radiant, note: 'secondary source' },
    { id: 'comet', at: () => SHOWER.comet, align: 'above', on: st.cometFound, name: SHOWER_NAMES.comet, note: 'primary source' },
    { id: 'summary', at: () => SHOWER.stray.summary, align: 'left', on: st.strayTrace >= 1, name: SHOWER_NAMES.summary, note: st.dropped ? '✗ no origin · not used' : '' },
    { id: 'page', at: () => SHOWER.stray.page, align: 'above', on: st.strayOn >= 1, name: SHOWER_NAMES.page, note: st.dropped ? '✗ only cites the summary' : '' },
  ]

  return (
    <>
      <section data-chapter="provenance" className="v-panel">
        <ChapterHead n="05" kicker="Provenance" title="Every claim, traced to where it began." />
        <div className="v-essay">
          <p data-on>
            A citation is only as good as what it stands on. Topical follows each one back, through
            every source to whatever that source cites, until it reaches the origin: a measurement, a
            record, someone who was there.
          </p>
          <p data-on>
            A trail that only loops through machine-written text, each page citing the last, has no
            origin. Topical flags it and won’t build on it.
          </p>
        </div>
      </section>

      {marks.map(mark => (
        <Anchor key={mark.id} space="earth" point={mark.at} chapters={['provenance']} align={mark.align} shown={() => (mark.on ? live() : 0)}>
          <span className="v-mark v-mark--trace" data-node={mark.id} data-dropped={st.dropped && (mark.id === 'summary' || mark.id === 'page')}>
            {mark.name}
            {mark.note && <span className="v-mark-status">{mark.note}</span>}
          </span>
        </Anchor>
      ))}
      <Anchor space="earth" point={strayAt} chapters={['provenance']} align="left" shown={() => (st.strayFall >= 1 ? live() : 0)}>
        <span className="v-mark v-mark--trace" data-node="stray" data-dropped={st.dropped}>a claim</span>
      </Anchor>
    </>
  )
}

/* ─────────────────────────── 06 · History and form ─────────────────────────── */

export function HistoryChapter() {
  return (
    <>
      <section data-chapter="history" className="v-panel">
        <ChapterHead n="06" kicker="History and form" title="Every version kept. Any form you need." />
        <div className="v-essay">
          <p data-on>
            Every draft is kept, and any of them is one step back. Branch off to try another
            approach, compare the two side by side, and keep the better one.
          </p>
          <p data-on>
            Write in Markdown, MDX or LaTeX, and send the same document out as a PDF, a website,
            or whatever it needs to be.
          </p>
        </div>
      </section>

      {VERSIONS.map((version, i) => (
        <Anchor key={version.name} space="galaxy" point={() => moonAt(version.back)} chapters={['history']} align="above" shown={() => versionShown(i)}>
          <span className="v-mark v-mark--version">{version.name}</span>
        </Anchor>
      ))}
      <Anchor space="galaxy" point={() => moonAt(BRANCH.back, BRANCH.out)} chapters={['history']} align="above" shown={branchShown}>
        <span className="v-mark v-mark--version" data-branch>{BRANCH.name}</span>
      </Anchor>
      <Anchor space="earth" point={underMoon} chapters={['history']} align="center" shown={() => versionShown(VERSIONS.length - 1)}>
        <span className="v-mark v-mark--version" data-now>now</span>
      </Anchor>
      {FORMATS.map((format, i) => (
        <Anchor key={format} space="earth" point={() => rayEnd(i)} chapters={['history']} align="right" shown={() => rayDrawn(i)}>
          <span className="v-mark v-mark--format">{format}</span>
        </Anchor>
      ))}
    </>
  )
}

/* ─────────────────────────── The question ─────────────────────────── */

function rememberTopic(topic: string) {
  try {
    localStorage.setItem('topical_pending_topic', topic)
  } catch {
    // Private mode blocks the write. Losing the topic is not worth a crash.
  }
}

export function ArrivalChapter({ startHref, startLabel }: { startHref: string; startLabel: string }) {
  const [value, setValue] = useState('')
  const navigate = useNavigate()
  const field = useRef<HTMLInputElement>(null)
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (value.trim()) rememberTopic(value.trim())
    navigate({ to: startHref })
  }
  return (
    <section data-chapter="arrival" className="v-arrival">
      <h2 className="v-arrival-title">So — what’s the topic?</h2>
      <div className="v-arrival-foot">
        <form className="topic-bar v-arrival-bar" onSubmit={submit}>
          <label className="sr-only" htmlFor="voyage-topic">Your topic</label>
          <div className="topic-field">
            <Input
              id="voyage-topic"
              ref={field}
              variant="bare"
              className="topic-input"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Anything you want to understand…"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </div>
          <Button type="submit" variant="primary" size="xl" className="topic-go">
            <span className="topic-go-label">{startLabel}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
        <p className="hero-aside">
          Free to start · bring your own model key ·{' '}
          <TextLink asChild variant="underline">
            <Link to="/community">read what others published</Link>
          </TextLink>
        </p>
      </div>
    </section>
  )
}
