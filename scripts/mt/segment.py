"""Paragraph- and sentence-splitting for the commentary corpus.

The reader renders commentary with `white-space: pre-line`, so the newline
structure is load-bearing: paragraph count, order and the exact run of
newlines between paragraphs all have to survive the round trip. Everything
here therefore splits with capturing groups and rejoins with the separators
it captured, rather than normalising them.
"""
import re

_PARA = re.compile(r"(\n+)")

# Abbreviations that end in a period without ending a sentence. The corpus is
# 19th/20th-century devotional English, so it is thick with these.
_ABBREV = {
    "mr", "mrs", "ms", "dr", "sri", "srimad", "sm", "st", "rev", "prof",
    "viz", "etc", "cf", "vs", "e.g", "i.e", "eg", "ie", "no", "vol", "ch",
    "chap", "p", "pp", "fig", "op", "cit", "ibid", "jr", "sr", "b", "c",
    "a", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "q",
    "r", "s", "t", "u", "v", "w", "x", "y", "z",
}

# A boundary is terminal punctuation, optional closing quotes/brackets, then
# whitespace, then something that can open a sentence — or, in 974 places in
# this corpus, no whitespace at all ("...called Kurukshetra.Sanjaya is one
# who..."). The same upstream mirror that replaced commas with `?` and deleted
# every `qu` digraph also ate these spaces. Left unsplit they hand the model a
# token it passes through untranslated, so the second alternative catches them:
# two lowercase letters before the stop and a capital-plus-lowercase after,
# which excludes initials and acronyms.
_BOUNDARY = re.compile(
    r'(?<=[.!?])(?P<q>["\'’”)\]]*)\s+(?=[A-Z“"\'(\[‘])'
    r'|(?<=[a-z]{2}[.!?])(?P<z>)(?=[A-Z][a-z])'
)


def split_paragraphs(text):
    """-> (chunks, separators) with len(seps) == len(chunks) - 1."""
    parts = _PARA.split(text)
    return parts[0::2], parts[1::2]


def join_paragraphs(chunks, seps):
    out = []
    for i, c in enumerate(chunks):
        out.append(c)
        if i < len(seps):
            out.append(seps[i])
    return "".join(out)


def _looks_like_abbrev(left):
    m = re.search(r"([A-Za-z.]+)\.$", left)
    if not m:
        return False
    return m.group(1).lower().rstrip(".") in _ABBREV


def split_sentences(para):
    """Split one paragraph into sentences. Returns [] for whitespace-only."""
    if not para.strip():
        return []
    out, last = [], 0
    for m in _BOUNDARY.finditer(para):
        end = m.end("q") if m.group("q") is not None else m.end("z")
        if _looks_like_abbrev(para[last:end]):
            continue
        piece = para[last:end]
        if piece.strip():
            out.append(piece)
        last = m.end()
    tail = para[last:]
    if tail.strip():
        out.append(tail)
    return out or [para]


def hard_split(sent, tlen, budget):
    """Break a sentence that overruns the model's positional budget.

    Falls through separators that carry meaning before resorting to a word
    wrap: semicolons and colons first (about ten verses in this corpus use a
    bare newline where a `;` belongs, and 2.10 is one 17k-char commentary),
    then commas, then whitespace.
    """
    if tlen(sent) <= budget:
        return [sent]

    for pat in (r"(?<=[;:])\s+", r"(?<=,)\s+"):
        parts = re.split(pat, sent)
        if len(parts) > 1:
            out, buf = [], ""
            for p in parts:
                cand = (buf + " " + p).strip() if buf else p
                if buf and tlen(cand) > budget:
                    out.append(buf)
                    buf = p
                else:
                    buf = cand
            if buf:
                out.append(buf)
            if all(tlen(p) <= budget for p in out):
                return out
            return [q for p in out for q in hard_split(p, tlen, budget)]

    words, out, buf = sent.split(" "), [], ""
    for w in words:
        cand = (buf + " " + w) if buf else w
        if buf and tlen(cand) > budget:
            out.append(buf)
            buf = w
        else:
            buf = cand
    if buf:
        out.append(buf)
    return out
