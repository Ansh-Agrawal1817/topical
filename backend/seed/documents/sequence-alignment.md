# Multiple Sequence Alignment, Explained Slowly

I wrote this for the new rotation students in our lab, because every year someone runs MAFFT on 4,000 sequences, gets a beautiful-looking alignment, and builds a tree on it without ever asking what the program decided on their behalf. None of this is new. It is the explanation I wanted in my first month.

## Why align at all

Two sequences that share an ancestor have been edited since they split: letters changed, letters added, letters removed. An alignment is a hypothesis about that history. Each column claims that the residues in it descend from the same position in the ancestor. A gap claims that a residue was inserted in one lineage or deleted in another.

So an alignment is not a formatting step before the real analysis. It *is* an analysis, and every downstream result inherits its mistakes. A tree built on a bad alignment is a confident answer to the wrong question.

## Two sequences first

Pairwise alignment is a solved problem in the sense that we can find the best alignment exactly, given a scoring scheme. The method is dynamic programming. Fill a table where cell $F(i, j)$ holds the best score for aligning the first $i$ letters of sequence $x$ with the first $j$ letters of $y$:

$$F(i,j) = \max\begin{cases} F(i-1,\,j-1) + s(x_i, y_j) \\ F(i-1,\,j) - d \\ F(i,\,j-1) - d \end{cases}$$

Here $s(a, b)$ is the score for putting $a$ above $b$, taken from a substitution matrix such as BLOSUM62, and $d$ is the penalty for a gap. The three cases are: the two letters are aligned with each other, or one of them is aligned with a gap. Trace back from the bottom-right cell and you have the alignment.

In practice nobody uses a single gap penalty. One long gap is usually one evolutionary event, while ten scattered gaps are ten events, so we charge more to open a gap than to extend one. With an opening penalty $o$ and extension penalty $e$, a gap of length $k$ costs $o + (k-1)e$. This is the affine gap model, and it needs three tables instead of one, but the idea is the same.

```python
def needleman_wunsch(x, y, score, gap):
    n, m = len(x), len(y)
    F = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        F[i][0] = -gap * i
    for j in range(1, m + 1):
        F[0][j] = -gap * j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            F[i][j] = max(F[i - 1][j - 1] + score(x[i - 1], y[j - 1]),
                          F[i - 1][j] - gap,
                          F[i][j - 1] - gap)
    return F[n][m]
```

That is the whole algorithm minus the traceback. It runs in $O(nm)$ time, which for two proteins of a few hundred residues is instant.

## Why many sequences is hard

The obvious generalisation fills an $N$-dimensional table for $N$ sequences. For 20 sequences of length 300 that table has $300^{20}$ cells. Exact multiple alignment is NP-hard under the usual scoring schemes, so every program you will use is a heuristic, and the heuristics differ in exactly the places that matter.

### Progressive alignment

The classic strategy, used by Clustal and as a first stage by most others:

1. Align every pair of sequences and turn the scores into distances.
2. Build a rough "guide tree" from those distances.
3. Walk up the guide tree, aligning the closest sequences first, then aligning those alignments to each other.

The weakness is in the phrase "once a gap, always a gap". When two sequences are merged early, any gap placed between them is frozen. If a later, more distant sequence shows that the gap was in the wrong place, it is too late to move it.

### Refinement and consistency

Programs like MAFFT (in its iterative modes), MUSCLE and T-Coffee try to undo early mistakes. Iterative refinement repeatedly splits the alignment in two along the guide tree, realigns the halves and keeps the change if the score improves. Consistency-based methods go further: before aligning anything, they check whether the pairwise alignments agree with each other through third sequences. If $x$ aligns position 12 with position 15 of $y$, and both align that position with position 40 of $z$, that pairing is trusted more.

## Choosing a method

| Situation | Reasonable choice | Why |
|---|---|---|
| Under ~200 sequences, accuracy matters | MAFFT L-INS-i | Iterative with local pairwise information; slow but careful |
| Thousands of sequences | MAFFT FFT-NS-2 | Fast progressive method with one refinement pass |
| Structural RNA | Infernal, or LocARNA | Sequence-only aligners ignore base pairing |
| Many indels, low identity | PRANK | Treats insertions and deletions phylogenetically |

None of these is "the best aligner". Benchmarks such as BAliBASE reward different programs depending on how divergent the sequences are.

## Checking what you got

Before you build anything on an alignment:

- **Look at it.** Open it in Jalview or AliView and scroll. Badly aligned regions are usually obvious: columns that are almost all gaps, or blocks where the residues look random.
- **Check stability.** Align with two different programs, or with the same program under different settings. Regions that change are regions you should not trust.
- **Trim with care.** Tools such as trimAl remove poorly aligned columns. Trimming helps tree inference up to a point, but aggressive trimming throws away real signal, so record exactly what you removed.

The most useful habit is the dullest: keep the command line, the version number and the input file for every alignment you use in a figure. Six months later, when a reviewer asks, you will not remember.
