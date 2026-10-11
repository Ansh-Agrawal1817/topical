import { AlertTriangle, Check, Clock, RotateCcw, SkipForward, X } from 'lucide-react';
import { Button, IconButton, Spinner } from '@/components/ui';
import { isActive, useAiJobs, useSecondTick, type AiQueue, type Job } from './queue';

const STATUS_TEXT: Record<Job['status'], string> = {
  queued: 'Waiting', running: 'Writing', retrying: 'Retrying', done: 'Done', failed: 'Failed', cancelled: 'Cancelled',
};

function JobRow({ job, queue }: { job: Job; queue: AiQueue }) {
  const seconds = job.retryAt ? Math.max(0, Math.ceil((job.retryAt - Date.now()) / 1000)) : 0;
  return (
    <li className="ai-job" data-status={job.status}>
      <span className="ai-job-icon" aria-hidden="true">
        {job.status === 'running' ? <Spinner size="2xs" tone="accent" />
          : job.status === 'retrying' ? <RotateCcw className="h-3 w-3" />
          : job.status === 'queued' ? <Clock className="h-3 w-3" />
          : job.status === 'done' ? <Check className="h-3 w-3" />
          : job.status === 'failed' ? <AlertTriangle className="h-3 w-3" />
          : <X className="h-3 w-3" />}
      </span>
      <span className="ai-job-text">
        <span className="ai-job-label" title={job.label}>{job.label}</span>
        <span className="ai-job-state">
          {job.status === 'retrying'
            ? `Rate limited or busy — retry ${job.attempt + 1} in ${seconds}s`
            : job.status === 'running' && job.attempt > 1
              ? `Writing · attempt ${job.attempt}`
              : STATUS_TEXT[job.status]}
          {job.reason && (job.status === 'failed' || job.status === 'retrying') && (
            <span className="ai-job-reason" title={job.reason}>{job.reason}</span>
          )}
        </span>
      </span>
      <span className="ai-job-tools">
        {job.status === 'retrying' && (
          <IconButton size="sm" onClick={() => queue.retryNow(job.id)} title="Retry now" aria-label={`Retry ${job.label} now`}>
            <SkipForward className="h-3 w-3" />
          </IconButton>
        )}
        {(job.status === 'failed' || job.status === 'cancelled') && (
          <IconButton size="sm" onClick={() => queue.retry(job.id)} title="Try again" aria-label={`Try ${job.label} again`}>
            <RotateCcw className="h-3 w-3" />
          </IconButton>
        )}
        {isActive(job) && (
          <IconButton size="sm" tone="danger" onClick={() => queue.cancel(job.id)} title="Cancel" aria-label={`Cancel ${job.label}`}>
            <X className="h-3 w-3" />
          </IconButton>
        )}
      </span>
    </li>
  );
}

/**
 * The AI queue: what is running, what is waiting, what is retrying and when.
 *
 * A rate limit used to surface as a failed section and a red toast. Now the
 * job waits and tries again by itself, and this list is where that is
 * visible — the countdown, the attempt, the reason the provider gave — with
 * a way to retry at once, cancel one, or stop everything.
 */
export function QueuePanel({ queue }: { queue: AiQueue }) {
  const jobs = useAiJobs(queue);
  const active = jobs.filter(isActive);
  const finished = jobs.filter(job => !isActive(job));
  useSecondTick(jobs.some(job => job.status === 'retrying'));

  if (!jobs.length) {
    return <p className="ai-empty">Nothing running. Sections you write and edits you ask for line up here, one at a time.</p>;
  }

  return (
    <div className="ai-queue">
      <ol className="ai-jobs">
        {[...active, ...finished.slice(-6).reverse()].map(job => <JobRow key={job.id} job={job} queue={queue} />)}
      </ol>
      <div className="ai-queue-foot">
        {active.length > 0 && (
          <Button variant="secondary" size="xs" onClick={() => queue.cancelAll()}>
            <X className="h-3 w-3" /> Stop all ({active.length})
          </Button>
        )}
        {finished.length > 0 && (
          <Button variant="ghost" size="xs" onClick={queue.clearFinished}>Clear finished</Button>
        )}
      </div>
    </div>
  );
}
