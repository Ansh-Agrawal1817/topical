# Bayesian A/B Tests Without the Hand-Waving

Our product team kept asking the same question about experiments: "So what's the chance B is better?" A p-value cannot answer that, and every time we explained why, the meeting lost ten minutes and nobody felt better. We moved our conversion experiments to a Bayesian analysis last year. This note is how it works, what it costs, and the mistakes we still see.

## The model

For a conversion metric, each visitor either converts or doesn't. If variant A has a true conversion rate $p_A$, the number of conversions $k_A$ out of $n_A$ visitors is binomial. We put a Beta prior on the rate:

$$p_A \sim \text{Beta}(\alpha, \beta)$$

The Beta is the conjugate prior for a binomial likelihood, which means the posterior is also a Beta, with the counts simply added on:

$$p_A \mid \text{data} \sim \text{Beta}(\alpha + k_A,\; \beta + n_A - k_A)$$

No MCMC, no special software. The same holds for B.

## Choosing the prior

We use a weakly informative prior centred on our historical conversion rate. Our checkout converts at about 4%, so we use $\text{Beta}(4, 96)$: its mean is 4%, and it carries the weight of about 100 imaginary visitors. With experiments of tens of thousands of visitors, the data swamps it within the first day, but it stops the first few hours of an experiment from producing absurd estimates like "B converts at 50%" after two lucky sign-ups.

People worry that a prior is "subjective". It is, and so is the decision to use a 5% significance threshold. The difference is that the prior is written down and can be argued about.

## The questions we actually answer

Draw samples from both posteriors and compare them:

```python
import numpy as np

rng = np.random.default_rng(7)
a = rng.beta(4 + 412, 96 + 10_000 - 412, size=200_000)   # A: 412 / 10,000
b = rng.beta(4 + 468, 96 + 10_000 - 468, size=200_000)   # B: 468 / 10,000

lift = b / a - 1
print("P(B > A)        ", (b > a).mean())
print("Expected lift   ", lift.mean())
print("90% interval    ", np.percentile(lift, [5, 95]))
print("Expected loss(B)", np.maximum(a - b, 0).mean())
```

For these numbers, $P(B > A)$ comes out around 0.97, with an expected relative lift of about 14% and a 90% interval of roughly 2% to 26%. The expected loss from shipping B is about 0.003 percentage points of conversion.

The number we base decisions on is the last one, the **expected loss**: if we ship B and it is actually worse, how much conversion do we lose on average? We ship when the expected loss falls below a threshold agreed in advance, typically 0.02 percentage points of conversion. That threshold answers "how much risk are we willing to take", which is the question the business actually cares about.

## What it doesn't fix

A Bayesian analysis is not a licence to be careless. The same mistakes still bite.

**Peeking still matters, just differently.** Bayesian posteriors are valid whenever you look at them, which is often sold as "you can peek as much as you like". That is true about the *posterior*. It is not true about your *decisions*: if you stop the moment $P(B > A)$ crosses 0.95, you will stop on noise more often than you think. We fix the minimum run length (two full weeks, to cover weekly cycles) before anyone looks.

**The model is too simple for revenue.** Conversion is binary, so Beta-Binomial fits. Revenue per visitor is not: it is mostly zeros with a long right tail. For revenue we use a two-part model, or simply bootstrap the difference in means, and report the conversion and the order value separately.

**Novelty effects.** A redesigned page often wins for a week because returning users notice something new. Look at the lift over time, not just the final number.

**Sample ratio mismatch.** If you assigned 50/50 and got 10,000 vs 10,600, something in the assignment or logging is broken, and no analysis will save the result. We run a chi-squared check on the split before looking at any outcome.

## What changed for us

The main win was not statistical. Product managers now ask "what's the expected loss if we're wrong?", which is a much better question than "is it significant?". Experiments that come back with $P(B > A) = 0.7$ are no longer described as "failed": they are described as "probably a small win, not worth the risk at this sample size", and the team decides whether to run longer.

The main cost is that results now take a paragraph to explain rather than a single starred number. We think the paragraph is worth it.
