import { useState } from 'react';
import { ArrowBigDown, ArrowBigUp, FileText, MessageSquare, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Post } from '@/lib/communityApi';
import { fetchPostDetail, votePost } from '@/lib/communityApi';
import { useAuth } from '@/lib/auth-context';
import { relativeTime } from '@/lib/format';
import { Avatar, Button, IconButton } from '@/components/ui';

interface Props {
  post: Post;
  onUpdate: (updated: Post) => void;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
}

/**
 * One discussion in the list: its score, its title and the start of what it
 * says, who started it and when, and how many have replied.
 *
 * Rows in one ruled list rather than a stack of cards — a forum is read
 * down a column, and a card per post made five posts look like five
 * separate objects with a gutter between each.
 *
 * Snappy on purpose: the score moves the moment it is pressed (corrected by
 * the server's answer), and the thread is fetched while the pointer is still
 * on its way to the click, so opening it shows the thread, not a spinner.
 */
export function ThreadRow({ post, onUpdate, onOpen, onDelete }: Props) {
  const { isAuthenticated, user } = useAuth();
  const qc = useQueryClient();
  const [mine, setMine] = useState<0 | 1 | -1>(0);
  const [shown, setShown] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const score = shown ?? post.upvotes - post.downvotes;
  const isAuthor = !!user && user.id === post.userId;

  const prefetch = () => {
    qc.prefetchQuery({ queryKey: ['post-detail', post.id], queryFn: () => fetchPostDetail(post.id), staleTime: 30_000 });
  };

  async function vote(direction: 1 | -1) {
    if (!isAuthenticated) return;
    // The same way twice clears the vote; the other way switches it.
    const next = mine === direction ? 0 : direction;
    setShown(score + next - mine);
    setMine(next);
    try {
      const updated = await votePost(post.id, direction);
      setShown(null);
      onUpdate(updated);
    } catch {
      setShown(null);
      setMine(mine);
    }
  }

  const excerpt = post.body.replace(/\s+/g, ' ').trim();

  return (
    <article className="thread" onPointerEnter={prefetch} onFocus={prefetch} data-mine-vote={mine}>
      <div className="thread-vote" aria-label={`Score ${score}`}>
        <button
          type="button"
          className="thread-vote-btn"
          data-on={mine === 1}
          onClick={() => vote(1)}
          disabled={!isAuthenticated}
          aria-label="Upvote"
          title={isAuthenticated ? 'Upvote' : 'Sign in to vote'}
        >
          <ArrowBigUp className="h-4 w-4" />
        </button>
        <span className="thread-score" data-sign={score > 0 ? 'up' : score < 0 ? 'down' : 'zero'}>{score}</span>
        <button
          type="button"
          className="thread-vote-btn"
          data-on={mine === -1}
          onClick={() => vote(-1)}
          disabled={!isAuthenticated}
          aria-label="Downvote"
          title={isAuthenticated ? 'Downvote' : 'Sign in to vote'}
        >
          <ArrowBigDown className="h-4 w-4" />
        </button>
      </div>

      <div className="thread-main">
        <h3 className="thread-title">
          {/* The whole row is the target for a pointer; this is the same
              action for the keyboard and for assistive tech. */}
          <button type="button" className="thread-open" onClick={() => onOpen(post.id)}>{post.title}</button>
        </h3>
        {excerpt && <p className="thread-excerpt">{excerpt}</p>}
        <div className="thread-meta">
          <span className="thread-author">
            <Avatar seed={post.userId} name={post.authorName} size="xs" />
            {post.authorName}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={post.createdAt ?? undefined}>{relativeTime(post.createdAt)}</time>
          {post.lessonPlanName && (
            <span className="thread-doc" title="Attached document">
              <FileText className="h-3 w-3" />
              {post.lessonPlanName}
            </span>
          )}
        </div>
      </div>

      <div className="thread-side">
        <span className="thread-replies" data-none={post.commentCount === 0} aria-label={`${post.commentCount} ${post.commentCount === 1 ? 'reply' : 'replies'}`}>
          <MessageSquare className="h-3.5 w-3.5" />
          {post.commentCount}
        </span>
        {isAuthor && (
          confirming ? (
            <span className="thread-confirm">
              <Button variant="secondary" tone="danger" size="xs" onClick={() => onDelete(post.id)}>Delete</Button>
              <Button variant="ghost" size="xs" onClick={() => setConfirming(false)}>Keep</Button>
            </span>
          ) : (
            <IconButton
              size="sm"
              tone="danger"
              revealOnHover
              onClick={() => setConfirming(true)}
              title="Delete this discussion"
              aria-label={`Delete "${post.title}"`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          )
        )}
      </div>

      {/* The row as a pointer target, under everything that acts on its own. */}
      <button type="button" className="thread-hit" tabIndex={-1} aria-hidden="true" onClick={() => onOpen(post.id)} />
    </article>
  );
}
