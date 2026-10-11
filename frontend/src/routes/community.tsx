/**
 * The community: discussions, the library of published documents, and the
 * people who write them — one screen, three tabs, and a sidebar that keeps
 * the other two in view while you read the first.
 *
 * Every document here opens at its own address, `/projects/:format/:id`, the
 * same one the projects page and the palette use. Whether it opens for reading
 * or for writing is settled there, by the server.
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, BookOpen, MessagesSquare, PenLine, Plus, Users as UsersIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { deletePost, fetchPosts, type Post, type SortMode } from '@/lib/communityApi';
import { fetchPeople, getPublicLessonPlans, personName, type LessonPlanResponse, type Person } from '@/lib/api';
import { documentRoute } from '@/lib/documentUrl';
import { errorMessage } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Avatar, Button, EmptyState, Kbd, Page, PageHeader, Refreshing, SearchField, Segmented, Skeleton } from '@/components/ui';
import { ThreadRow } from '@/components/community/ThreadRow';
import { DocumentTile } from '@/components/community/DocumentTile';
import { PostDetail } from '@/components/community/PostDetail';
import { NewPostDialog } from '@/components/community/NewPostDialog';

type Tab = 'discussions' | 'library' | 'people';

export const Route = createFileRoute('/community')({
  // The tab is in the address, so a link to the library opens on the library.
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => (
    search.tab === 'library' || search.tab === 'people' ? { tab: search.tab } : {}
  ),
  component: CommunityPage,
});

/** Who wrote a document: you, a member by name, or their handle. */
function authorOf(plan: LessonPlanResponse, viewerId: string | undefined, people: Person[]) {
  if (plan.userId === viewerId) return 'You';
  const person = people.find(p => p.id === plan.userId);
  if (person) return personName(person);
  return plan.authorUsername ? `@${plan.authorUsername}` : 'A member';
}

function CommunityPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate({ from: '/community' });
  const qc = useQueryClient();
  const { tab = 'discussions' } = Route.useSearch();
  const setTab = (next: Tab) => navigate({ search: next === 'discussions' ? {} : { tab: next }, replace: true });

  const [sort, setSort] = useState<SortMode>('latest');
  const [search, setSearch] = useState('');
  const [openPostId, setOpenPostId] = useState<number | null>(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // `/` to search, from anywhere on the page that is not already a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== '/' || event.metaKey || event.ctrlKey || target?.closest('input, textarea, [contenteditable]')) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Data: all three load at once, so switching tabs is instant ──
  const postsQuery = useQuery({ queryKey: ['community-posts', sort], queryFn: () => fetchPosts(sort) });
  const libraryQuery = useQuery({ queryKey: ['public-lesson-plans'], queryFn: getPublicLessonPlans });
  const peopleQuery = useQuery({ queryKey: ['people', ''], queryFn: () => fetchPeople('') });

  const [edited, setEdited] = useState<Record<number, Post>>({});
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => terms.every(term => text.toLowerCase().includes(term));

  const posts = useMemo(() => (postsQuery.data ?? [])
    .map(post => edited[post.id] ?? post)
    .filter(post => !deletedIds.includes(post.id))
    // Author too: "who posted this?" is as common as "what was it called?".
    .filter(post => matches(`${post.title} ${post.body} ${post.authorName} ${post.lessonPlanName ?? ''}`)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [postsQuery.data, edited, deletedIds, search]);

  const library = useMemo(() => [...(libraryQuery.data?.lessonPlans ?? [])]
    .sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? '')), [libraryQuery.data]);
  const people = peopleQuery.data ?? [];
  const libraryShown = library.filter(plan => matches(`${plan.name} ${authorOf(plan, user?.id, people)}`));
  const peopleShown = people.filter(person => matches(`${personName(person)} ${person.username ?? ''} ${person.bio ?? ''}`));

  const handlePostUpdate = useCallback((updated: Post) => {
    setEdited(prev => ({ ...prev, [updated.id]: updated }));
  }, []);

  /** Remove at once, putting the row back if the server says no. */
  const handleDeletePost = useCallback(async (id: number) => {
    setDeletedIds(prev => [...prev, id]);
    try {
      await deletePost(id);
      toast.success('Discussion deleted');
      qc.invalidateQueries({ queryKey: ['community-posts'] });
      setOpenPostId(current => (current === id ? null : current));
    } catch (err) {
      setDeletedIds(prev => prev.filter(d => d !== id));
      toast.error(errorMessage(err, 'Could not delete that discussion'));
    }
  }, [qc]);

  const tabs: { id: Tab; label: string; icon: typeof BookOpen; count: number | null }[] = [
    { id: 'discussions', label: 'Discussions', icon: MessagesSquare, count: postsQuery.data?.length ?? null },
    { id: 'library', label: 'Library', icon: BookOpen, count: libraryQuery.data ? library.length : null },
    { id: 'people', label: 'People', icon: UsersIcon, count: peopleQuery.data ? people.length : null },
  ];

  const placeholder = tab === 'discussions' ? 'Search discussions' : tab === 'library' ? 'Search the library' : 'Search people';

  return (
    <Page className="community">
      <PageHeader
        section="Community"
        title="Where the writing is shared."
        subtitle="Ask a question, show a draft, read what others have published — and find the people writing about what you are."
        actions={isAuthenticated && (
          <Button variant="primary" size="lg" onClick={() => setShowNewPost(true)}>
            <Plus className="h-4 w-4" /> New discussion
          </Button>
        )}
      />

      <div className="community-layout">
        <div className="community-main">
          {/* ── Tabs: underlined, with counts, so the size of each is known before it is opened ── */}
          <div className="community-tabs" role="tablist" aria-label="Community">
            {tabs.map(item => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className="community-tab"
                onClick={() => setTab(item.id)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.count !== null && <span className="community-tab-count">{item.count}</span>}
              </button>
            ))}
          </div>

          <div className="community-bar">
            <SearchField
              ref={searchRef}
              grow
              placeholder={placeholder}
              aria-label={placeholder}
              value={search}
              onValueChange={setSearch}
              clearOnEscape
              hint={<Kbd>/</Kbd>}
            />
            {tab === 'discussions' && (
              <Segmented
                variant="pills"
                size="sm"
                aria-label="Sort discussions"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'latest', label: 'Latest' },
                  { value: 'top', label: 'Top' },
                ]}
              />
            )}
            <Refreshing active={(tab === 'discussions' ? postsQuery : tab === 'library' ? libraryQuery : peopleQuery).isFetching
              && !(tab === 'discussions' ? postsQuery : tab === 'library' ? libraryQuery : peopleQuery).isLoading} />
          </div>

          {/* ── Discussions ── */}
          {tab === 'discussions' && (
            postsQuery.isLoading ? (
              <div className="thread-list" aria-hidden="true">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="thread thread--skeleton">
                    <div className="thread-vote"><Skeleton height={44} width={22} /></div>
                    <div className="thread-main">
                      <Skeleton height={16} width={`${70 - i * 8}%`} className="mb-2" />
                      <Skeleton height={11} width="88%" className="mb-2.5" />
                      <Skeleton height={10} width="36%" />
                    </div>
                  </div>
                ))}
              </div>
            ) : posts.length > 0 ? (
              <div className="thread-list">
                {posts.map(post => (
                  <ThreadRow key={post.id} post={post} onUpdate={handlePostUpdate} onOpen={setOpenPostId} onDelete={handleDeletePost} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={MessagesSquare}
                tone="muted"
                title={search ? `No discussions match “${search}”` : 'No discussions yet'}
                description={search ? 'Try fewer words, or search the library instead.' : 'Ask a question or share a draft — the first discussion sets the tone.'}
                action={isAuthenticated && !search && (
                  <Button variant="primary" size="lg" onClick={() => setShowNewPost(true)}>
                    <Plus className="h-4 w-4" /> Start one
                  </Button>
                )}
              />
            )
          )}

          {/* ── Library ── */}
          {tab === 'library' && (
            libraryQuery.isLoading ? (
              <div className="library-grid" aria-hidden="true">
                {[0, 1, 2, 3].map(i => <Skeleton key={i} height={196} radius="lg" />)}
              </div>
            ) : libraryShown.length > 0 ? (
              <div className="library-grid">
                {libraryShown.map(plan => (
                  <DocumentTile key={plan.id} plan={plan} author={authorOf(plan, user?.id, people)} own={plan.userId === user?.id} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BookOpen}
                tone="muted"
                title={search ? `Nothing in the library matches “${search}”` : 'Nothing published yet'}
                description="Documents appear here when their author makes them public."
              />
            )
          )}

          {/* ── People ── */}
          {tab === 'people' && (
            peopleQuery.isLoading ? (
              <div className="people-grid" aria-hidden="true">
                {[0, 1, 2, 3].map(i => <Skeleton key={i} height={84} radius="lg" />)}
              </div>
            ) : peopleShown.length > 0 ? (
              <div className="people-grid">
                {peopleShown.map(person => (
                  <Link key={person.id} to="/u/$username" params={{ username: person.username ?? '' }} className="person-tile">
                    <Avatar seed={person.id} src={person.avatarUrl} name={personName(person)} size="md" />
                    <span className="person-tile-text">
                      <span className="person-tile-name">{personName(person)}</span>
                      <span className="person-tile-handle">@{person.username}</span>
                      {person.bio && <span className="person-tile-bio">{person.bio}</span>}
                    </span>
                    <ArrowRight className="person-tile-go h-4 w-4" />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={UsersIcon}
                tone="muted"
                title={search ? `No one matches “${search}”` : 'No members yet'}
                description="Members appear here once they choose a username."
              />
            )
          )}
        </div>

        {/* ── Sidebar: the other two tabs, in brief ── */}
        <aside className="community-aside" aria-label="Around the community">
          <section className="aside-card aside-card--intro">
            <PenLine className="h-4 w-4 aside-card-icon" />
            <h2 className="aside-title">Working on something?</h2>
            <p className="aside-text">
              Share a draft for feedback, or ask how others would structure a topic. Attach a published
              document and readers can open it from the discussion.
            </p>
            {isAuthenticated ? (
              /* Secondary: the header's button is this screen's one primary. */
              <Button variant="secondary" size="md" width="full" onClick={() => setShowNewPost(true)}>
                <Plus className="h-3.5 w-3.5" /> New discussion
              </Button>
            ) : (
              <Button asChild variant="secondary" size="md" width="full">
                <Link to="/login">Sign in to post</Link>
              </Button>
            )}
          </section>

          <section className="aside-card">
            <div className="aside-head">
              <h2 className="aside-label">Recently published</h2>
              <button type="button" className="aside-more" onClick={() => setTab('library')}>Library</button>
            </div>
            {libraryQuery.isLoading ? (
              <div className="aside-list">{[0, 1, 2].map(i => <Skeleton key={i} height={34} />)}</div>
            ) : library.length ? (
              <ul className="aside-list">
                {library.slice(0, 4).map(plan => (
                  <li key={plan.id}>
                    <Link {...documentRoute(plan.id, plan.mainTopic)} className="aside-doc">
                      <span className="aside-doc-title">{plan.name}</span>
                      <span className="aside-doc-meta">{authorOf(plan, user?.id, people)} · {formatDate(plan.updatedAt ?? plan.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="aside-text">Nothing yet.</p>
            )}
          </section>

          <section className="aside-card">
            <div className="aside-head">
              <h2 className="aside-label">Members {people.length > 0 && <span className="aside-count">{people.length}</span>}</h2>
              <button type="button" className="aside-more" onClick={() => setTab('people')}>Everyone</button>
            </div>
            <div className="aside-faces">
              {people.slice(0, 12).map(person => (
                <Link key={person.id} to="/u/$username" params={{ username: person.username ?? '' }} title={personName(person)} className="aside-face">
                  <Avatar seed={person.id} src={person.avatarUrl} name={personName(person)} size="sm" alt={personName(person)} />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {openPostId !== null && (
        <PostDetail
          postId={openPostId}
          onClose={() => setOpenPostId(null)}
          onPostUpdate={handlePostUpdate}
          onDelete={handleDeletePost}
        />
      )}
      {showNewPost && (
        <NewPostDialog
          onClose={() => setShowNewPost(false)}
          onCreated={post => {
            qc.invalidateQueries({ queryKey: ['community-posts'] });
            setOpenPostId(post.id);
          }}
        />
      )}
    </Page>
  );
}
