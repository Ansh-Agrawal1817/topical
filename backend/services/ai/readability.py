"""How a piece of generated writing reads, in numbers.

Used by ``python -m backend.cli writing-check`` to compare prompt changes on
real output. None of this gates generation — ``quality.py`` does that; these
are the measurements a person tuning the prompts looks at.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Sequence

from .quality import _prose, stock_phrases

_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9*$(\"“])")
_WORD = re.compile(r"[A-Za-z]+(?:['’-][A-Za-z]+)*")


def _syllables(word: str) -> int:
    word = word.lower()
    groups = re.findall(r"[aeiouy]+", word)
    count = len(groups) - (1 if word.endswith("e") and len(groups) > 1 else 0)
    return max(1, count)


def _plain(text: str, fmt: str) -> str:
    """Prose only: no headings, tables, code, maths or markup."""
    text = _prose(text, fmt)
    text = re.sub(r"^\s*(#{1,6}\s.*|\|.*)$", " ", text, flags=re.M)
    text = re.sub(r"\$[^$\n]*\$", " x ", text)
    text = re.sub(r"[*_`>#]", " ", text)
    return re.sub(r"[ \t]+", " ", text)


@dataclass
class Report:
    words: int
    sentences: int
    mean_sentence: float
    long_sentences: float  # share over 30 words
    reading_ease: float  # Flesch: 60-70 plain English, 30-50 college, <30 academic
    maths_per_100: float  # inline maths spans per 100 words
    stock: List[str]

    def row(self) -> str:
        return (f"{self.words:5}w  {self.mean_sentence:5.1f} w/sent  {self.long_sentences:4.0%} long  "
                f"ease {self.reading_ease:5.1f}  maths/100w {self.maths_per_100:4.1f}"
                + (f"  stock: {', '.join(self.stock)}" if self.stock else ""))


def report(text: str, fmt: str = "mdx") -> Report:
    plain = _plain(text, fmt)
    sentences = [s for s in _SENTENCE.split(" ".join(plain.split())) if _WORD.search(s)]
    words = _WORD.findall(plain)
    lengths = [len(_WORD.findall(s)) for s in sentences] or [0]
    syllables = sum(_syllables(w) for w in words)
    n_words, n_sent = max(len(words), 1), max(len(sentences), 1)
    ease = 206.835 - 1.015 * (n_words / n_sent) - 84.6 * (syllables / n_words)
    maths = len(re.findall(r"\$[^$\n]+\$", text))
    return Report(
        words=len(words), sentences=len(sentences), mean_sentence=sum(lengths) / n_sent,
        long_sentences=sum(1 for n in lengths if n > 30) / n_sent, reading_ease=ease,
        maths_per_100=100 * maths / n_words, stock=stock_phrases(text),
    )


def _shingles(text: str, size: int = 6) -> set:
    words = [w.lower() for w in _WORD.findall(text)]
    return {" ".join(words[i:i + size]) for i in range(len(words) - size + 1)}


def overlap(sections: Sequence[str]) -> Dict[int, float]:
    """For each section, the share of its six-word runs that also appear in an earlier one."""
    seen: set = set()
    out: Dict[int, float] = {}
    for i, text in enumerate(sections):
        own = _shingles(text)
        out[i] = len(own & seen) / len(own) if own else 0.0
        seen |= own
    return out
