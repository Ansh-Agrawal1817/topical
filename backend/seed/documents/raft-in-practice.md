# Raft in Practice: What the Paper Doesn't Tell You

The Raft paper is one of the clearest systems papers ever written, and you should read it before this. These are the notes I wish I'd had the first time I put a Raft-based store into production and spent a week on problems the paper mentions in a single sentence, or not at all.

## The thirty-second version

A Raft cluster has one leader at a time. Clients send writes to the leader, which appends them to its log and replicates the entries to followers. An entry is *committed* once a majority of the cluster has it, and only committed entries are applied to the state machine. If followers stop hearing from the leader, one of them times out, becomes a candidate, and asks for votes. A candidate whose log is at least as up to date as a majority's wins, and becomes leader for a new *term*.

Everything below is about the gap between that paragraph and a system that stays up.

## Election timeouts are a tuning problem

The paper recommends randomised election timeouts, typically 150–300 ms, so that two followers rarely time out together. That range assumes a LAN with sub-millisecond round trips. Across availability zones, and especially across regions, it causes elections during perfectly normal latency spikes.

The rule of thumb that has worked for us:

$$\text{broadcast time} \ll \text{election timeout} \ll \text{mean time between failures}$$

Measure your p99 round-trip time between nodes *under load*, not when idle, and set the minimum election timeout to at least ten times that. A cluster that elects a new leader every few minutes is not "highly available". Every election is a window in which no writes succeed.

## Pre-vote, or: the node that kept partitioning itself

Picture a node that is isolated by a flaky switch. It times out, increments its term, starts an election, fails to reach anyone, times out again, increments again. When the network heals, it rejoins with a term far higher than everyone else's. The current leader sees the higher term, steps down, and the cluster holds an unnecessary election.

The fix is the *pre-vote* phase, from Diego Ongaro's thesis rather than the paper. Before incrementing its term, a candidate asks whether it *would* win. Followers that have heard from a leader recently say no. Most mature implementations, including etcd's, support it. Turn it on.

## Reads are not free

The obvious way to serve a read is to have the leader answer from its state machine. That is wrong. A leader that has been partitioned away may not know it has been replaced, and it will happily serve stale data.

The safe options:

| Approach | Cost | Safe? |
|---|---|---|
| Read from local state on any node | None | No — stale reads |
| Log the read as an entry | One full replication round | Yes, but slow |
| ReadIndex | One heartbeat round to a majority | Yes |
| Lease-based reads | None per read | Yes, *if* clocks drift less than you assume |

ReadIndex is the usual choice. The leader records its current commit index, confirms it is still leader by hearing from a majority, waits until its state machine has applied up to that index, and then answers. Leases avoid the round trip but depend on bounded clock drift, and "bounded clock drift" is the kind of assumption that holds right up until a VM is paused for live migration.

## Log compaction will find you

The log grows forever unless you snapshot. The paper covers snapshotting, but the operational details are where the time goes:

- **Snapshot size.** A follower far behind the leader gets the whole snapshot. If that is several gigabytes, sending it can take longer than the election timeout, the follower falls behind again, and you have a loop. Stream snapshots in chunks, and make sure the transfer does not starve heartbeats.
- **When to snapshot.** Snapshotting on a fixed entry count is simple and wrong for workloads with very uneven entry sizes. Snapshot on log *bytes* instead.
- **Disk.** Write the snapshot to a temporary file, `fsync` it, then rename. A half-written snapshot that survives a crash will be read back as a valid one.

## Membership changes

Adding or removing nodes is the part of Raft most often implemented wrongly. The paper's joint consensus approach is correct but intricate. Most implementations instead change membership *one server at a time*, which the thesis shows is safe because any two majorities of the old and new configurations overlap.

The trap is adding a new, empty node as a voting member straight away. In a three-node cluster it becomes the fourth voter, the majority becomes three, and until the newcomer catches up the cluster can only commit if *every* original node is healthy. Add new nodes as non-voting learners, wait until they have caught up, then promote them.

## What I'd check before trusting an implementation

1. Does it support pre-vote and ReadIndex, and are they on by default?
2. Has it been tested with Jepsen or an equivalent fault-injection harness, and are the results public?
3. Does it `fsync` the log before acknowledging an append? Some "fast" modes don't.
4. How does it behave when a single disk becomes slow rather than failing outright? Slow disks cause more incidents than dead ones.

The paper gives you a correct algorithm. Production gives you clocks, disks, switches and people pushing configuration changes on a Friday. Plan for the second list.
