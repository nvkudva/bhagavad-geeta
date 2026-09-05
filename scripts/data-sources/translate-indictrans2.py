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
        return "cuda", torch.float16
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps", torch.float16
    return "cpu", torch.float32


def split_paragraphs(text):
    """Paragraphs, each a list of sentences.

    The reader renders commentary with `white-space: pre-line`, so paragraph
    count and order have to survive the round trip exactly. Sentences are the
    unit the model sees because it is trained on sentences and has a hard input
    limit; paragraphs are the unit we rebuild.
    """
    paras = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    return [[s.strip() for s in re.split(r"(?<=[.!?])\s+", p) if s.strip()] for p in paras]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-field", required=True, help="e.g. commentary_english")
    ap.add_argument("--target-field", required=True, help="e.g. commentary_kannada")
    ap.add_argument("--lang", required=True, choices=sorted(TAGS), help="IndicTrans2 target tag")
    ap.add_argument("--out", required=True, help="output JSON, keyed chapter.verse")
    ap.add_argument("--model", default="ai4bharat/indictrans2-en-indic-1B")
    ap.add_argument("--batch", type=int, default=16,
                    help="sentences per batch; effective batch is batch x beams. "
                         "Not monotonic — measure before raising (16->32 was 16x SLOWER on MPS)")
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

    # Flatten to sentences, remembering where each came from so paragraphs can
    # be rebuilt exactly.
    units, index = [], []
    for vid, src in todo:
        for pi, para in enumerate(split_paragraphs(src)):
            for si, sent in enumerate(para):
                index.append((vid, pi, si))
                units.append(sent)

    device, dtype = pick_device()
    print(f"{len(todo)} verses, {len(units)} sentences -> {TAGS[args.lang]} on {device} ({dtype})")

    tok = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    # torch_dtype, not dtype: transformers 4.46.3 predates the rename, and this
    # script pins that version because newer ones break IndicTrans2's cache path.
    model = AutoModelForSeq2SeqLM.from_pretrained(
        args.model, trust_remote_code=True, torch_dtype=dtype
    ).to(device).eval()
    ip = IndicProcessor(inference=True)

    # Length-sorted batching: padding is to the longest member of each batch, so
    # grouping similar lengths together is usually the single largest throughput
    # win. Original order is restored via the saved positions.
    order = sorted(range(len(units)), key=lambda i: len(units[i]))
    translated = [None] * len(units)

    t0 = time.time()
    for start in range(0, len(order), args.batch):
        idxs = order[start : start + args.batch]
        batch = ip.preprocess_batch([units[i] for i in idxs], src_lang="eng_Latn", tgt_lang=args.lang)
        enc = tok(batch, truncation=True, padding="longest", return_tensors="pt").to(device)
        with torch.no_grad():
            gen = model.generate(**enc, num_beams=args.beams, max_length=args.max_length)
        dec = ip.postprocess_batch(tok.batch_decode(gen, skip_special_tokens=True), lang=args.lang)
        for i, text in zip(idxs, dec):
            translated[i] = text

        seen = start + len(idxs)
        rate = seen / (time.time() - t0)
        eta = (len(order) - seen) / rate / 60 if rate else 0
        print(f"\r{seen}/{len(order)} sentences  {rate:.2f}/s  eta {eta:.1f}m", end="", flush=True)

        # Flush completed verses after every batch so a crash never costs more
        # than the batch in flight.
        if start % (args.batch * 20) == 0:
            partial = assemble(index, translated, todo)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps({**done, **partial}, ensure_ascii=False, indent=2))

    print()
    result = {**done, **assemble(index, translated, todo)}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))

    elapsed = time.time() - t0
    try:
        shown = out_path.relative_to(ROOT)
    except ValueError:
        shown = out_path  # an out-of-tree path, e.g. a scratch file
    print(f"{len(result)} verses written to {shown} in {elapsed / 60:.1f}m "
          f"({len(units) / elapsed:.2f} sentences/s)")
    print("\nNext: verify, then merge —")
    print(f"  node scripts/data-sources/coverage.mjs --field {args.target_field}")
    print(f"  node scripts/data-sources/merge-language.mjs --input {args.out} \\")
    print(f"    --field {args.target_field} --script <script> --machine-flag \\")
    print(f'    --source "machine-assisted — IndicTrans2 {args.model.split("/")[-1]}" --dry')


def assemble(index, translated, todo):
    """Rebuild verse text from translated sentences, preserving paragraphs.

    A verse is only emitted once every one of its sentences is present, so a
    partial flush never writes a truncated commentary.
    """
    by_verse = {}
    for (vid, pi, si), text in zip(index, translated):
        by_verse.setdefault(vid, {}).setdefault(pi, {})[si] = text

    out = {}
    for vid, _src in todo:
        paras = by_verse.get(vid)
        if not paras:
            continue
        if any(t is None for p in paras.values() for t in p.values()):
            continue
        out[vid] = "\n".join(
            " ".join(paras[pi][si] for si in sorted(paras[pi])) for pi in sorted(paras)
        )
    return out


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\ninterrupted — rerun the same command to resume", file=sys.stderr)
        sys.exit(130)
