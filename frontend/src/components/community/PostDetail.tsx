import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowBigDown, ArrowBigUp, ArrowUpRight, FileText, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Comment, Post } from '@/lib/communityApi';
import { addComment, deleteComment, fetchPostDetail, votePost } from '@/lib/communityApi';
import { useAuth } from '@/lib/auth-context';
import { documentRoute } from '@/lib/documentUrl';
import { errorMessage } from '@/lib/utils';
import { relativeTime } from '@/lib/format';
import { Avatar, Button, IconButton, Kbd, Modal, Skeleton, Textarea } from '@/components/ui';

interface PostDetailProps {
  postId: number;
  onClose: () => void;
  onPostUpdate: (p: Post) => void;
  onDelete?: (id: number) => void;
}

type Detail = { post: Post; comments: Comment[] };

/**
 * A discussion, open beside the list it came from: the post set for reading,
 * the document it is about one click away, and the replies under a box to
 * add your own.
 *
 * A sheet rather than a centred dialog, so the list stays in view and the
 * next thread is a click away — reading a forum is moving between threads.
 * Replies post optimistically and roll back if the server refuses them.
 */
export function PostDetail({ postId, onClose, onPostUpdate, onDelete }: PostDetailProps) {
  const { isAuthenticated, user } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['post-detail', postId], queryFn: () => fetchPostDetail(postId) });
  const post = data?.post;
  const comments = data?.comments ?? [];
  const score = (post?.upvotes ?? 0) - (post?.downvotes ?? 0);
  const isAuthor = !!user && !!post && user.id === post.userId;

  const vote = useMutation({
    mutationFn: (v: 1 | -1) => votePost(postId, v),
    onSuccess: updated => {
      onPostUpdate(updated);
      qc.setQueryData<Detail>(['post-detail', postId], old => (old ? { ...old, post: updated } : old));
    },
  });

  const comment = useMutation({
    mutationFn: (body: string) => addComment(postId, body),
    onMutate: async body => {
      await qc.cancelQueries({ queryKey: ['post-detail', postId] });
      const previous = qc.getQueryData<Detail>(['post-detail', postId]);
      const optimistic: Comment = {
        id: -Date.now(), // negative: never collides with a real id
        postId,
        userId: user?.id ?? '',
        authorName: user?.given_name || user?.username || 'You',
        body,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<Detail>(['post-detail', postId], old => (old ? { ...old, comments: [optimistic, ...old.comments] } : old));
      setReply('');
      return { previous, optimisticId: optimistic.id };
    },
    onError: (err, body, ctx) => {
      if (ctx?.previous) qc.setQueryData(['post-detail', postId], ctx.previous);
      setReply(body);
      toast.error(errorMessage(err, 'Could not post your reply'));
    },
    onSuccess: (saved, _body, ctx) => {
      qc.setQueryData<Detail>(['post-detail', postId], old => (old ? {
        ...old,
        comments: old.comments.map(c => (c.id === ctx?.optimisticId ? saved : c)),
      } : old));
      if (post) onPostUpdate({ ...post, commentCount: post.commentCount + 1 });
    },
  });

  const removeComment = useMutation({
    mutationFn: (commentId: number) => deleteComment(postId, commentId),
    onMutate: async commentId => {
      await qc.cancelQueries({ queryKey: ['post-detail', postId] });
      const previous = qc.getQueryData<Detail>(['post-detail', postId]);
      qc.setQueryData<Detail>(['post-detail', postId], old => (old ? { ...old, comments: old.comments.filter(c => c.id !== commentId) } : old));
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(['post-detail', postId], ctx.previous);
      toast.error(errorMessage(err, 'Could not delete that reply'));
    },
    onSuccess: () => {
      if (post) onPostUpdate({ ...post, commentCount: Math.max(post.commentCount - 1, 0) });
    },
  });

  const send = () => { if (reply.trim() && !comment.isPending) comment.mutate(reply.trim()); };

  return (
    <Modal label={post?.title ?? 'Discussion'} onClose={onClose} overlayClassName="thread-sheet-overlay">
      <div className="thread-sheet">
        <header className="thread-sheet-head">
          <span className="thread-sheet-kicker">Discussion</span>
          <div className="thread-sheet-tools">
            {isAuthor && onDelete && (
              <IconButton size="md" tone="danger" onClick={() => onDelete(postId)} title="Delete this discussion" aria-label="Delete this discussion">
                <Trash2 className="h-4 w-4" />
              </IconButton>
            )}
            <IconButton size="md" onClick={onClose} title="Close" aria-label="Close">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </header>

        {isLoading ? (
          <div className="thread-sheet-body" aria-hidden="true">
            <Skeleton height={26} width="80%" className="mb-3" />
            <Skeleton height={12} width="40%" className="mb-6" />
            <Skeleton height={12} width="96%" className="mb-2" />
            <Skeleton height={12} width="92%" className="mb-2" />
            <Skeleton height={12} width="60%" />
          </div>
        ) : post ? (
          <div className="thread-sheet-body">
            <h2 className="thread-sheet-title">{post.title}</h2>
            <div className="thread-sheet-byline">
              <Avatar seed={post.userId} name={post.authorName} size="sm" />
              <span className="thread-sheet-author">{post.authorName}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={post.createdAt ?? undefined}>{relativeTime(post.createdAt)}</time>
            </div>

            {post.body && <div className="thread-sheet-text">{post.body}</div>}

            {post.lessonPlanId && post.lessonPlanName && (
              <Link {...documentRoute(post.lessonPlanId, null)} className="thread-sheet-doc">
                <FileText className="h-4 w-4" />
                <span className="thread-sheet-doc-text">
                  <span className="thread-sheet-doc-label">Attached document</span>
                  <span className="thread-sheet-doc-name">{post.lessonPlanName}</span>
                </span>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            )}

            <div className="thread-sheet-votes">
              <button type="button" className="thread-vote-btn" onClick={() => vote.mutate(1)} disabled={!isAuthenticated || vote.isPending} aria-label="Upvote">
                <ArrowBigUp className="h-4 w-4" />
              </button>
              <span className="thread-score" data-sign={score > 0 ? 'up' : score < 0 ? 'down' : 'zero'}>{score}</span>
              <button type="button" className="thread-vote-btn" onClick={() => vote.mutate(-1)} disabled={!isAuthenticated || vote.isPending} aria-label="Downvote">
                <ArrowBigDown className="h-4 w-4" />
              </button>
              <span className="thread-sheet-count">{comments.length} {comments.length === 1 ? 'reply' : 'replies'}</span>
            </div>

            {isAuthenticated ? (
              <form className="reply-box" onSubmit={event => { event.preventDefault(); send(); }}>
                <Avatar seed={user?.id} name={user?.given_name || user?.username || 'You'} size="xs" />
                <div className="reply-box-field">
                  <Textarea
                    value={reply}
                    onChange={event => setReply(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(); }
                    }}
                    placeholder="Add a reply…"
                    aria-label="Add a reply"
                    rows={2}
                  />
                  <div className="reply-box-foot">
                    <span className="reply-box-hint"><Kbd>⌘</Kbd><Kbd>↵</Kbd> to send</span>
                    <Button type="submit" variant="primary" size="sm" disabled={!reply.trim() || comment.isPending}>
                      <Send className="h-3.5 w-3.5" /> Reply
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <p className="reply-signin"><Link to="/login">Sign in</Link> to reply.</p>
            )}

            <ol className="reply-list">
              {comments.map(c => {
                const pending = c.id < 0;
                const mine = !!user && c.userId === user.id;
                return (
                  <li key={c.id} className="reply" data-pending={pending}>
                    <Avatar seed={c.userId} name={c.authorName} size="xs" />
                    <div className="reply-main">
                      <div className="reply-head">
                        <span className="reply-author">{c.authorName}</span>
                        <span className="reply-time">{pending ? 'sending…' : relativeTime(c.createdAt)}</span>
                        {mine && !pending && (
                          <IconButton
                            size="sm"
                            tone="danger"
                            revealOnHover
                            className="ml-auto"
                            onClick={() => removeComment.mutate(c.id)}
                            title="Delete reply"
                            aria-label="Delete your reply"
                          >
                            <Trash2 className="h-3 w-3" />
                          </IconButton>
                        )}
                      </div>
                      <p className="reply-body">{c.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <p className="thread-sheet-missing">This discussion is gone.</p>
        )}
      </div>
    </Modal>
  );
}
