#!/usr/bin/env python3
"""Translate a corpus field into an Indic language locally with IndicTrans2.

No API key and no network once the model is cached. Output is a JSON object
keyed "chapter.verse", which is what merge-language.mjs consumes.

    python scripts/data-sources/translate-indictrans2.py \
        --source-field commentary_english \
        --target-field commentary_kannada \
        --lang kan_Knda \
        --out scripts/data-sources/commentary-kannada-mt.json

Read .claude/skills/translate-corpus/references/translation-quality.md before
trusting the output. In short: this model is good on plain exposition and
unreliable on Sanskrit technical vocabulary, which is most of what a Gita
commentary is made of. It is a draft generator and a back-translation checker,
not a substitute for review.

Environment (the versions are load-bearing, see the skill):
    uv venv --python 3.12 .venv-it2
    uv pip install --python .venv-it2/bin/python \
        torch "transformers==4.46.3" sentencepiece IndicTransToolkit

transformers 5.x and 4.5x break IndicTrans2's vendored modeling code; on 4.46.3
the KV cache works and must stay enabled — forcing use_cache=False measured 32x
slower on this corpus.

Two traps that cost real time, both silent:

  * IndicProcessor pairs preprocess_batch with postprocess_batch through an
    internal FIFO of placeholder maps. Preprocessing the whole corpus up front
    and postprocessing it in length-sorted order desynchronises that queue and
    wedges the processor with no error and no CPU use. They are paired per
    batch below; keep them that way.
  * Batches are sized by a token budget, not a sentence count. Beam memory
    scales with batch x longest-sentence-in-batch, and this corpus spans 5 to
    185 tokens; at a fixed 256 sentences the long tail asks for ~60 GiB. Under
    WSL that does not raise — the driver spills to host memory over PCIe and
    throughput collapses from 21 to 0.56 sentences/sec.
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# IndicTrans2 language tags. Add a row to support another target.
TAGS = {
    "kan_Knda": "Kannada",
    "tel_Telu": "Telugu",
    "hin_Deva": "Hindi",
    "tam_Taml": "Tamil",
    "mar_Deva": "Marathi",
    "mal_Mlym": "Malayalam",
    "ben_Beng": "Bengali",
    "guj_Gujr": "Gujarati",
    "ory_Orya": "Odia",
    "pan_Guru": "Punjabi",
}


def pick_device():
    import torch

    if torch.cuda.is_available():
        # bfloat16 on CUDA: same speed as fp16 on this model and more robust
        # numerically. Measured 21.6 vs 21.1 sentences/sec on an RTX 5090.
        return "cuda", torch.bfloat16
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps", torch.float16
    return "cpu", torch.float32


# Abbreviations that end in a period without ending a sentence. This corpus is
# 19th and 20th century devotional English, so it is thick with them.
ABBREV = {
    "mr", "mrs", "ms", "dr", "sri", "srimad", "sm", "st", "rev", "prof",
    "viz", "etc", "cf", "vs", "e.g", "i.e", "eg", "ie", "no", "vol", "ch",
    "chap", "p", "pp", "fig", "op", "cit", "ibid", "jr", "sr",
    *"abcdefghijklmnopqrstuvwxyz",
}

# A sentence boundary is terminal punctuation, optional closing quotes, then
# whitespace, then something that can open a sentence — or, in 974 places in
# this corpus, no whitespace at all ("...called Kurukshetra.Sanjaya is one
# who..."). The same upstream mirror that replaced commas with `?` and deleted
# every `qu` digraph also ate those spaces. Left unsplit they hand the model a
# token it passes through untranslated, which is where the stray Latin words in
# an otherwise clean run come from. The second alternative wants two lowercase
# letters before the stop and a capital-plus-lowercase after, which excludes
# initials and acronyms.
BOUNDARY = re.compile(
    r'(?<=[.!?])(?P<q>["\'’”)\]]*)\s+(?=[A-Z“"\'(\[‘])'
    r'|(?<=[a-z]{2}[.!?])(?P<z>)(?=[A-Z][a-z])'
)


def _is_abbrev(left):
    m = re.search(r"([A-Za-z.]+)\.$", left)
    return bool(m) and m.group(1).lower().rstrip(".") in ABBREV


def split_sentences(para):
    """Split one paragraph into sentences, honouring the abbreviation list."""
    out, last = [], 0
    for m in BOUNDARY.finditer(para):
        end = m.end("q") if m.group("q") is not None else m.end("z")
        if _is_abbrev(para[last:end]):
            continue
        if para[last:end].strip():
            out.append(para[last:end].strip())
        last = m.end()
    if para[last:].strip():
        out.append(para[last:].strip())
    return out or [para.strip()]


def split_paragraphs(text):
    """-> (paragraphs as sentence lists, the separators between them).

    The reader renders commentary with `white-space: pre-line`, so paragraph
    count, order *and* the exact run of newlines between paragraphs are all
    load-bearing: collapsing a blank line changes the rendering. The separators
    are captured and handed back so assemble() can put them back verbatim.
    Sentences are the unit the model sees, because it is trained on sentences
    and has a hard input limit; paragraphs are the unit we rebuild.
    """
    parts = re.split(r"(\n+)", text)
    chunks, seps = parts[0::2], parts[1::2]
    keep, keep_seps = [], []
    for i, c in enumerate(chunks):
        if c.strip():
            keep.append(split_sentences(c.strip()))
            if i < len(seps):
                keep_seps.append(seps[i])
    return keep, keep_seps[: max(0, len(keep) - 1)]


def hard_split(sent, tlen, budget):
    """Break a sentence that overruns the model's positional budget.

    Without this, `truncation=True` silently drops the tail of any sentence
    over the model's 256 positions — this corpus has some at 286 tokens, and
    one 17k-character commentary. Falls through separators that carry meaning
    before resorting to a word wrap: semicolons and colons first (about ten
    verses use a bare newline where a `;` belongs), then commas, then spaces.
    """
    if tlen(sent) <= budget:
        return [sent]
    for pat in (r"(?<=[;:])\s+", r"(?<=,)\s+"):
        parts = re.split(pat, sent)
        if len(parts) > 1:
            out, buf = [], ""
            for piece in parts:
                cand = (buf + " " + piece).strip() if buf else piece
                if buf and tlen(cand) > budget:
                    out.append(buf)
                    buf = piece
                else:
                    buf = cand
            if buf:
                out.append(buf)
            if all(tlen(p) <= budget for p in out):
                return out
            return [q for p in out for q in hard_split(p, tlen, budget)]
    out, buf = [], ""
    for w in sent.split(" "):
        cand = (buf + " " + w) if buf else w
        if buf and tlen(cand) > budget:
            out.append(buf)
            buf = w
        else:
            buf = cand
    if buf:
        out.append(buf)
    return out


# Decode memory is bounded by generated length, not source length, and a very
# short sentence still gets a decoder cache sized by the stopping heuristic
# rather than by its input. Costing a 5-token sentence at 5 tokens builds a
# 300-sentence batch that then allocates a 28 GiB KV cache. The floor makes the
# budget reflect what generation actually costs.
LENGTH_FLOOR = 24


def batches(order, lengths, budget, max_batch):
    """Group length-sorted indices so batch x longest-in-batch stays under budget."""
    cur = []
    for i in order:
        peak = max([max(lengths[i], LENGTH_FLOOR)]
                   + [max(lengths[j], LENGTH_FLOOR) for j in cur])
        if cur and ((len(cur) + 1) * peak > budget or len(cur) + 1 > max_batch):
            yield cur
            cur = []
        cur.append(i)
    if cur:
        yield cur


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-field", required=True, help="e.g. commentary_english")
    ap.add_argument("--target-field", required=True, help="e.g. commentary_kannada")
    ap.add_argument("--lang", required=True, choices=sorted(TAGS), help="IndicTrans2 target tag")
    ap.add_argument("--out", required=True, help="output JSON, keyed chapter.verse")
    ap.add_argument("--model", default="ai4bharat/indictrans2-en-indic-1B")
    ap.add_argument("--budget", type=int, default=1500,
                    help="tokens per batch (batch size x longest sentence in it). "
                         "Throughput is flat from 1500 to 12000 on a 5090 once "
                         "batches are length-sorted, while peak VRAM goes 5.5 -> "
                         "23 GiB, so the small end is free. Raising it is how you "
                         "hit the host-memory spill described at the top.")
    ap.add_argument("--max-batch", type=int, default=384,
                    help="hard cap on sentences per batch, whatever the budget allows")
    ap.add_argument("--beams", type=int, default=5)
    ap.add_argument("--max-length", type=int, default=256)
    ap.add_argument("--limit", type=int, help="only the first N verses, for a trial run")
    ap.add_argument("--only", help="comma-separated verse ids, e.g. 1.1,2.47")
    ap.add_argument("--overwrite", action="store_true",
                    help="retranslate verses that already have the target field")
    args = ap.parse_args()

    import torch
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    from IndicTransToolkit.processor import IndicProcessor

    verses = json.loads((ROOT / "src" / "data" / "verses.json").read_text())

    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = ROOT / out_path
    # Resume: anything already written stays written, so an interrupted run
    # costs only the batch it was in.
    done = json.loads(out_path.read_text()) if out_path.exists() else {}

    only = set(args.only.split(",")) if args.only else None
    todo = []
    for v in verses:
        vid = f"{v['chapter_id']}.{v['verse_number']}"
        if only and vid not in only:
            continue
        if vid in done:
            continue
        src = v.get(args.source_field)
        if not isinstance(src, str) or not src.strip():
            continue
        if not args.overwrite:
            tgt = v.get(args.target_field)
            if isinstance(tgt, str) and tgt.strip():
                continue
        todo.append((vid, src))

    if args.limit:
        todo = todo[: args.limit]

    if not todo:
        print(f"nothing to do — {len(done)} already in {out_path.name}")
        return

    device, dtype = pick_device()
    tok = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)

    # The vendored tokenizer reads the two language tags off the front of the
    # string and asserts on anything else, so a bare sentence cannot be
    # measured directly — it has to be tagged first.
    def tlen(text):
        tagged = f"eng_Latn {args.lang} {text}"
        return len(tok(tagged, add_special_tokens=False)["input_ids"])

    # Flatten to sentence pieces, remembering where each came from so
    # paragraphs can be rebuilt exactly. A sentence too long for the model's
    # positions becomes several pieces, rejoined with a space.
    budget_tokens = min(args.max_length - 16, 200)
    units, index, separators = [], [], {}
    for vid, src in todo:
        paras, seps = split_paragraphs(src)
        separators[vid] = seps
        for pi, para in enumerate(paras):
            for si, sent in enumerate(para):
                for ki, piece in enumerate(hard_split(sent, tlen, budget_tokens)):
                    index.append((vid, pi, si, ki))
                    units.append(piece)

    print(f"{len(todo)} verses, {len(units)} sentence pieces -> "
          f"{TAGS[args.lang]} on {device} ({dtype})")
    # torch_dtype, not dtype: transformers 4.46.3 predates the rename, and this
    # script pins that version because newer ones break IndicTrans2's cache path.
    model = AutoModelForSeq2SeqLM.from_pretrained(
        args.model, trust_remote_code=True, torch_dtype=dtype
    ).to(device).eval()
    if device == "cuda":
        # Fail loudly rather than spilling into host memory: see the top of the
        # file. Without this an oversized batch crawls instead of raising.
        torch.cuda.set_per_process_memory_fraction(0.92)
    ip = IndicProcessor(inference=True)

    # Length-sorted batching: padding is to the longest member of each batch, so
    # grouping similar lengths together is the single largest throughput win.
    # Original order is restored via the saved positions.
    lengths = [tlen(u) for u in units]
    order = sorted(range(len(units)), key=lambda i: lengths[i])
    translated = [None] * len(units)

    t0, seen, flushed = time.time(), 0, 0
    for idxs in batches(order, lengths, args.budget, args.max_batch):
        # preprocess and postprocess must bracket the same batch — see the
        # FIFO note at the top of this file.
        batch = ip.preprocess_batch([units[i] for i in idxs],
                                    src_lang="eng_Latn", tgt_lang=args.lang)
        enc = tok(batch, truncation=True, padding="longest",
                  max_length=args.max_length, return_tensors="pt").to(device)
        with torch.no_grad():
            gen = model.generate(
                **enc, num_beams=args.beams, max_length=args.max_length,
                # Without this, beam search runs to max_length instead of
                # stopping once the beams are complete, and the decoder cache
                # for a large batch of short sentences reaches tens of GiB.
                early_stopping=args.beams > 1,
            )
        dec = ip.postprocess_batch(tok.batch_decode(gen, skip_special_tokens=True), lang=args.lang)
        for i, text in zip(idxs, dec):
            translated[i] = text

        seen += len(idxs)
        rate = seen / (time.time() - t0)
        eta = (len(order) - seen) / rate / 60 if rate else 0
        print(f"\r{seen}/{len(order)} pieces  {rate:.2f}/s  eta {eta:.1f}m", end="", flush=True)

        # Flush completed verses periodically so a crash never costs more than
        # the work since the last flush.
        if seen - flushed >= 2000:
            flushed = seen
            partial = assemble(index, translated, todo, separators)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps({**done, **partial}, ensure_ascii=False, indent=2))

    print()
    result = {**done, **assemble(index, translated, todo, separators)}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))

    elapsed = time.time() - t0
    try:
        shown = out_path.relative_to(ROOT)
    except ValueError:
        shown = out_path  # an out-of-tree path, e.g. a scratch file
    print(f"{len(result)} verses written to {shown} in {elapsed / 60:.1f}m "
          f"({len(units) / elapsed:.2f} pieces/s)")
    print("\nNext: verify, then merge —")
    print(f"  node scripts/data-sources/coverage.mjs --field {args.target_field}")
    print(f"  node scripts/data-sources/merge-language.mjs --input {args.out} \\")
    print(f"    --field {args.target_field} --script <script> --machine-flag \\")
    print(f'    --source "machine-assisted — IndicTrans2 {args.model.split("/")[-1]}" --dry')


def assemble(index, translated, todo, separators):
    """Rebuild verse text from translated pieces, preserving paragraphs.

    A verse is only emitted once every one of its pieces is present, so a
    partial flush never writes a truncated commentary. Paragraphs are rejoined
    with the separators captured from the source rather than a bare newline,
    because `white-space: pre-line` renders a blank line as a blank line.
    """
    by_verse = {}
    for (vid, pi, si, ki), text in zip(index, translated):
        by_verse.setdefault(vid, {}).setdefault(pi, {}).setdefault(si, {})[ki] = text

    out = {}
    for vid, _src in todo:
        paras = by_verse.get(vid)
        if not paras:
            continue
        if any(t is None
               for p in paras.values() for s in p.values() for t in s.values()):
            continue
        rendered = [
            " ".join(" ".join(paras[pi][si][ki] for ki in sorted(paras[pi][si]))
                     for si in sorted(paras[pi]))
            for pi in sorted(paras)
        ]
        seps = separators.get(vid, [])
        text = rendered[0] if rendered else ""
        for i, para in enumerate(rendered[1:]):
            text += (seps[i] if i < len(seps) else "\n") + para
        out[vid] = text
    return out


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrupted — rerun the same command to resume", file=sys.stderr)
        sys.exit(130)
