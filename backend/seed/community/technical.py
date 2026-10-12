"""Community posts about engineering, data and science write-ups."""

POSTS = [
    {
        "author": "priyar", "days_ago": 92, "doc": "raft-in-practice", "votes": (20, 1),
        "title": "Raft notes: the things the paper mentions in one sentence",
        "body": """Wrote up what I learned running a Raft-based store in production: election timeouts across zones, pre-vote, why reads aren't free, snapshotting, and membership changes. It's not a Raft explainer. Read the paper first, it's excellent.

What did I miss? I'm especially interested in failure modes people have hit that aren't in there.""",
        "comments": [
            ("wkowalski", 3, """Slow disks, as you say at the end, but specifically: a follower with a slow fsync slows the *leader* if your implementation waits for a majority that includes it. We had a three-node cluster where one degraded disk turned every write into a 300ms write. Nothing was "down", so nothing alerted. Worth adding per-follower replication latency to your dashboards."""),
            ("priyar", 5, """Oh that's a good one, and it bit us too, I just filed it under "slow disks" in my head. Per-follower latency is going in the notes."""),
            ("mchen_data", 14, """On lease reads: we run chrony everywhere with sub-millisecond offsets. Isn't the clock drift concern mostly theoretical with modern NTP?"""),
            ("priyar", 16, """Offsets are small in steady state. The problem is pauses: a VM gets paused for live migration, a long GC pause, a process gets stopped by SIGSTOP. The node's clock is fine but *its view of time* jumps, and it can still believe its lease is valid when it isn't. That's the case that bit us. ReadIndex costs a round trip but doesn't care how long you were frozen."""),
            ("mchen_data", 17, """The VM pause case hadn't occurred to me. That's convincing."""),
            ("dbrooks", 40, """Lovely write-up. It's remarkable how many of these problems are timing problems wearing a disguise. We had the same flavour of trouble with redundant control systems in the 80s, just with relays instead of VMs."""),
            ("wkowalski", 46, """Also: test what happens when the leader's disk fills up. Ours kept accepting writes into memory, then fell over in a way that took the whole cluster down with it."""),
        ],
    },
    {
        "author": "wkowalski", "days_ago": 23, "doc": "postmortem-cache-stampede", "votes": (16, 0),
        "title": "Postmortem: the cache stampede (and three fixes that made it worse first)",
        "body": """Sharing our postmortem from a SEV-2 earlier this year, lightly edited. A rolling restart emptied local caches faster than they could refill, the database saturated, and three of our four recovery actions made things worse before they made them better.

I'm sharing it mostly for the "why recovery took so long" section. Our incident instincts (roll back, add capacity, keep retrying) all assume load spreads out over time. When the problem is the load, they backfire.""",
        "comments": [
            ("priyar", 4, """Request coalescing is the fix I'd have reached for first too. Did you use something off the shelf or write it yourselves? Every implementation I've seen has a subtle bug around what happens when the one in-flight request fails."""),
            ("wkowalski", 6, """Wrote it ourselves, and yes — our first version had every waiting request fail when the in-flight one failed. Now a failure releases the waiters to try again, but only one of them gets to make the next database call. Getting that right took longer than the rest of the change put together."""),
            ("ravi-iyer", 19, """Coming from structural engineering, the "most fragile while changing" lesson is familiar. Most structures that fail do so during construction or demolition, not in service, because that's when the load paths are temporary and nobody's checked them as carefully."""),
            ("wkowalski", 21, """That's a great parallel. Temporary load paths is exactly what a rolling deploy is."""),
            ("mchen_data", 34, """The connection pool increase making it worse is so counterintuitive and so common. I've seen the same thing in our analytics database. More concurrency on a saturated CPU just means everything gets slower together."""),
            ("bencarter", 51, """Not in software, but this was really readable. Is a "retry budget" just a limit on how many retries a service is allowed to send?"""),
            ("wkowalski", 53, """Roughly. It's a cap on retries as a fraction of normal traffic, say 10%. Once the budget is used up, failed requests fail instead of retrying. It stops a struggling service getting hit by twice its normal load at exactly the wrong moment."""),
        ],
    },
    {
        "author": "mchen_data", "days_ago": 40, "doc": "bayesian-ab-tests", "votes": (15, 2),
        "title": "We moved our A/B tests to Bayesian analysis a year ago. Ask me anything",
        "body": """Write-up of how we analyse conversion experiments now: Beta-Binomial model, expected loss as the decision rule, and the mistakes it does *not* protect you from (peeking-driven stopping, revenue metrics, novelty effects, sample ratio mismatch).

Happy to answer questions, including sceptical ones.""",
        "comments": [
            ("jlindqvist", 7, """Sceptical one, then. With a weakly informative prior and tens of thousands of visitors per arm, your posterior probabilities will be numerically very close to what a frequentist analysis gives you. Isn't the main change in how you *talk* about the result, rather than the statistics?"""),
            ("mchen_data", 9, """Honestly, yes, and I think that's the point. The numbers rarely differ much at our sample sizes. What changed is that the decision rule (expected loss below a threshold agreed in advance) is something product managers can reason about, so decisions are better. If a frequentist team got the same behaviour from well-explained confidence intervals, I'd be happy for them."""),
            ("jlindqvist", 11, """That's a more defensible position than "Bayesian is better", which is what I usually hear. Fair enough."""),
            ("therrera", 20, """For revenue you mention bootstrapping the difference in means. How many resamples do you use, and do you stratify by anything? Our phylogenetics bootstraps have the same "long tail" problem and I'm curious how you handle the zeros."""),
            ("mchen_data", 23, """10,000 resamples, stratified by platform because iOS and Android revenue distributions are wildly different. The zeros are fine for the bootstrap itself; the problem is the few huge orders, which make the interval very wide. We report a trimmed mean alongside for that reason."""),
            ("grace_a", 30, """Econ student here. The expected loss idea is basically a loss function from decision theory, right? We did this in a stats module and I never saw it used anywhere real until now."""),
            ("mchen_data", 32, """Exactly that. It's an old idea, and it fits business decisions really naturally, because "what does it cost if I'm wrong" is a question people already ask."""),
            ("priyar", 45, """The sample ratio mismatch check before looking at outcomes should be mandatory everywhere. We found a bug in our assignment service that way that had been quietly biasing experiments for months."""),
        ],
    },
    {
        "author": "therrera", "days_ago": 84, "doc": "sequence-alignment", "votes": (10, 0),
        "title": "Would anyone sanity-check my alignment explainer before it goes to rotation students?",
        "body": """Written for the new rotation students in our lab, who every year run an aligner on thousands of sequences and build a tree without asking what the aligner decided for them. It covers pairwise DP, why multiple alignment is hard, progressive vs consistency methods, and how to check an alignment.

Biologists and computer scientists both welcome. I'm worried it's too maths-heavy for some and too hand-wavy for others.""",
        "comments": [
            ("jlindqvist", 9, """The recurrence is clearly presented. One suggestion: say explicitly that the score is only "best" relative to the scoring scheme. Students from a maths background in particular will read "optimal" and assume it means "true"."""),
            ("therrera", 12, """Good point, that's actually the central misconception I'm fighting and I don't say it in so many words. Adding it."""),
            ("bencarter", 27, """First-year natsci student, so maybe your target audience minus three years. The affine gap bit lost me at "it needs three tables". Is it one table for "ending in a match", one for "ending in a gap in x" and one for "ending in a gap in y"?"""),
            ("therrera", 29, """Exactly that! You've just explained it better than my notes do. I'll steal your sentence."""),
            ("fatima_z", 48, """A-level biology teacher here. I might use your first section with my Year 13s when we do evolution. "An alignment is a hypothesis about history" is a lovely way to put it."""),
        ],
    },
    {
        "author": "hrezaei", "days_ago": 66, "doc": "renal-sodium", "votes": (12, 0),
        "title": "Renal sodium handling notes + the three questions our study group got wrong",
        "body": """My renal revision notes, structured around one question: for each segment of the nephron, where is sodium reabsorbed, through which transporter, and which drug acts there. Learning the apical transporter per segment turned out to be most of the work, and it explains most of the diuretics.

The questions at the end are the ones our group got wrong in a mock. Corrections very welcome — I'm a student, not a nephrologist.""",
        "comments": [
            ("therrera", 10, """From the molecular side: NKCC2 is a lovely example of secondary active transport, and it's the same family as NKCC1 that's in almost every cell. Loop diuretics hit both, which is part of why high doses cause ototoxicity, since NKCC1 is important in the inner ear."""),
            ("hrezaei", 13, """I didn't know the ototoxicity link was NKCC1. That's going in the notes as a footnote. Thank you."""),
            ("dbrooks", 31, """A patient's-eye view: I was put on bendroflumethiazide for blood pressure some years back and ended up in A&E with low sodium after a hot week of gardening. Nobody had warned me about drinking pints of water while on it. Might be worth a line about hyponatraemia in older patients, because it's apparently common."""),
            ("hrezaei", 34, """That's a really good point and it's actually a classic exam case too: thiazides cause hyponatraemia more than loop diuretics, partly because they don't disrupt the medullary gradient, so you can still concentrate urine and hold on to water. Glad you're alright. Adding a section."""),
            ("fatima_z", 55, """Saving for my A-level biologists who want to do medicine. The table is so clear."""),
        ],
    },
    {
        "author": "ravi-iyer", "days_ago": 57, "doc": "simply-supported-beam", "votes": (11, 0),
        "title": "Worked example: timber joist design for new graduates",
        "body": """The example I take every graduate through in their first month: a timber floor joist, checked for bending, shear and deflection. Simple enough to see every step, and the steps are the same for much bigger structures.

The main lesson, which surprises people every time: for timber floors, strength almost never governs. Stiffness does.""",
        "comments": [
            ("samw", 5, """Woodworker (furniture, not buildings). The shear section says notches matter. How much does a notch at the end of a joist actually weaken it? I see a lot of notched joists in old houses when people take floors up."""),
            ("ravi-iyer", 8, """More than people expect. A notch on the underside at the support creates a stress concentration at the corner of the notch, and timber tends to split along the grain from there. Codes reduce the shear capacity sharply depending on how deep the notch is. As a rough rule, don't notch the bottom edge near a support at all, and keep notches on the top edge to a small fraction of the depth. Plumbers notching joists for pipes cause a surprising number of saggy floors."""),
            ("samw", 9, """That explains the very bouncy bathroom floor in my last flat."""),
            ("priyar", 22, """Software person, but the "use factored loads for strength and unfactored for serviceability" distinction is a nice analogy for capacity planning: plan for peak with a safety margin, but measure user experience at normal load."""),
            ("ravi-iyer", 26, """I like that. Same idea: one check asks "will it break", the other asks "will anyone be unhappy"."""),
            ("bencarter", 37, """Why does doubling the depth give eight times the stiffness? I can see the h³ in the formula but not why."""),
            ("ravi-iyer", 41, """Two effects multiply. A deeper section puts material further from the centre, and material further out contributes more to resisting bending, in proportion to the square of its distance. Then there's simply more material. Distance squared, times the extra depth: that's the cube."""),
        ],
    },
    {
        "author": "chloem", "days_ago": 43, "doc": "carbon-cycle-timescales", "votes": (13, 1),
        "title": "Carbon cycle on three timescales (outreach session for sixth-formers)",
        "body": """Notes from an outreach session I ran for sixth-formers, expanded for our MSc study group. The main idea: the carbon cycle is several cycles at very different speeds, and most confusion (including "why can't we just plant trees") comes from mixing up the timescales.

Numbers are rounded and approximate, and I've tried to say so. Corrections welcome.""",
        "comments": [
            ("isolberg", 6, """Could you add references for the reservoir figures? The students we send to outreach sessions often ask where numbers come from, and it's a good chance to model citing a source."""),
            ("chloem", 9, """Yes, good call. They're rounded from the IPCC AR6 Working Group I report, chapter 5. I'll add the citation under the table."""),
            ("mchen_data", 21, """The "20% stays for thousands of years" fact is genuinely one I didn't know, and it changes how I think about offsets entirely."""),
            ("ravi-iyer", 33, """Interesting from a construction point of view: cement production releases CO₂ from limestone directly, on top of the energy used. So we're literally taking carbon out of the slow cycle and putting it into the fast one twice."""),
            ("chloem", 36, """Yes! And concrete reabsorbs a little CO₂ over decades as it carbonates, which is the slow cycle trying to win it back, just not nearly fast enough."""),
            ("bencarter", 52, """Question 2 (why is the Antarctic seasonal swing smaller) — is it because there's much less land, and so much less vegetation, in the Southern Hemisphere?"""),
            ("chloem", 55, """Exactly right. Less land, less seasonal growth and decay, and the CO₂ that does vary has been mixed a long way by the time it reaches the South Pole."""),
        ],
    },
]
